'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, apiFetch, apiPost } from '@/lib/api'
import { downscaleToLimit, MAX_IMAGE_BYTES, readAsDataUrl } from '@/lib/imageFile'

// Mirrors backend_new's questionImageBodySchema. Kept in step by hand --
// the point of checking here is to say "that file is too big" while the
// admin can still do something about it, not to replace the server check.
const MAX_IMAGES = 3
const ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]
type PickedFile = {
  // Stable across re-renders so React keys and the remove button agree
  // even when two screenshots share a name (clipboard pastes are all
  // called "image.png").
  key: string
  name: string
  mimeType: string
  /** Raw base64, no data: prefix. */
  data: string
  /**
   * data: URL for the thumbnail, or null for a PDF (nothing to show).
   * Deliberately the data URL and not an object URL -- the same bytes are
   * already held in `data` for the request, so this costs nothing extra
   * and needs no revoking.
   */
  previewUrl: string | null
  bytes: number
  downscaled: boolean
}

type QuestionImageResponse = {
  subjectId: number
  questions: unknown[]
}

/**
 * Turns a failed recognition into something the admin can act on.
 *
 * What matters is whose problem it is. An overloaded provider needs
 * nothing but another click; a screenshot the model couldn't read needs a
 * different screenshot. The previous copy offered both at once, which
 * sent admins hunting for a clearer image during what were really
 * upstream 503s.
 */
const describeRecognizeError = (e: unknown): string => {
  if (!(e instanceof ApiError))
    return `辨識失敗：${e instanceof Error ? e.message : String(e)}`

  switch (e.code) {
    // Our own quota, not the provider's capacity. Clicking again straight
    // away spends more of an allowance that is already gone, so this is
    // the one case that asks for a wait with a number on it.
    case 'AI_RATE_LIMITED':
      return 'AI 辨識次數已達上限，請等待約一分鐘再試。連續點按會讓等待時間變長。'
    // The provider itself said "later": Gemini answers an overloaded
    // model with 503.
    case 'AI_UNAVAILABLE':
    case 'AI_REQUEST_FAILED':
    case 'AI_EMPTY_RESPONSE':
      return 'AI 服務目前忙線中，請稍候幾秒再按一次「AI 辨識」。這是暫時性狀況，與截圖品質無關。'
    // The call went through but the reply was unusable; here a clearer
    // screenshot genuinely can help.
    case 'AI_INVALID_JSON':
    case 'AI_INVALID_SHAPE':
      return 'AI 回傳的格式不正確，請再試一次；若持續失敗，請換一張更清楚的截圖。'
    // Config problems, not content problems -- an admin retrying these
    // forever would never get anywhere.
    case 'AI_MODEL_NOT_FOUND':
      return 'AI 模型設定已失效（可能已停止服務），請聯絡系統管理員更新模型設定。'
    case 'AI_NOT_CONFIGURED':
      return '伺服器尚未完成 AI 設定（金鑰或模型），請聯絡系統管理員。'
  }

  if (e.status === 429)
    return '請求過於頻繁，請稍等一分鐘再試。'
  if (e.status === 400)
    return '圖片格式或大小不符，或此科目尚未建立觀念（需先新增觀念才能辨識）。'
  if (e.status === 404) return '找不到此科目。'
  // A 502/504 carrying no code never reached the handler -- CloudFront or
  // API Gateway answered first, including on the 29s gateway timeout.
  if (e.status === 502 || e.status === 504)
    return 'AI 服務暫時無法連線或辨識逾時，請稍候幾秒再試一次。'
  return `辨識失敗（${e.status}），請再試一次。`
}

type PromptPart = 'systemInstruction' | 'userPrompt'

// Module scope so the array is not rebuilt on every render, and so the
// labels sit next to the type they enumerate.
const PROMPT_PARTS: { part: PromptPart; label: string }[] = [
  { part: 'systemInstruction', label: '複製系統指示' },
  { part: 'userPrompt', label: '複製題目 prompt' },
]

/**
 * Failures for the prompt fetch, which shares almost nothing with the
 * recognition errors above: no model is called, so none of the AI_* codes
 * can appear and "try again in a few seconds" would be wrong advice. What
 * is left is configuration (no concepts yet) and access.
 */
const describeCopyPromptError = (e: unknown): string => {
  if (!(e instanceof ApiError))
    return `取得 prompt 失敗：${e instanceof Error ? e.message : String(e)}`

  if (e.status === 400) return '此科目尚未建立觀念，請先新增觀念。'
  if (e.status === 404) return '找不到此科目。'
  // The route is requireAdmin, unlike the rest of this page's reads.
  if (e.status === 401 || e.status === 403) return '需要管理員權限才能取得 prompt。'
  return `取得 prompt 失敗（${e.status}），請再試一次。`
}

export default function QuestionImageUpload({
  subjectId,
  onQuestions,
}: {
  subjectId: number
  /** Called with the pretty-printed question array the model returned. */
  onQuestions: (json: string) => void
}) {
  const [files, setFiles] = useState<PickedFile[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  // Which half is in flight, and which was copied last -- tracked per
  // part so the two buttons report their own state independently.
  const [copying, setCopying] = useState<PromptPart | null>(null)
  const [copied, setCopied] = useState<PromptPart | null>(null)
  // Holds the text only when the clipboard write failed, so what was
  // fetched is still reachable instead of lost to a dead end.
  const [promptFallback, setPromptFallback] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Read inside addFiles, which is async and must not compute "how many
  // slots are left" inside a setState updater -- React may run an updater
  // more than once, and the count feeds a user-visible rejection message.
  const filesRef = useRef<PickedFile[]>([])
  filesRef.current = files

  const addFiles = useCallback(async (incoming: File[]) => {
    setError(null)
    if (incoming.length === 0) return

    const accepted: PickedFile[] = []
    const rejected: string[] = []

    for (const file of incoming) {
      if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
        rejected.push(`${file.name || '檔案'}（不支援的格式）`)
        continue
      }

      let mimeType = file.type
      let dataUrl: string
      let downscaled = false

      if (file.size > MAX_IMAGE_BYTES) {
        const shrunk = await downscaleToLimit(file)
        if (!shrunk) {
          rejected.push(`${file.name || '檔案'}（超過 ${(MAX_IMAGE_BYTES / 1024 / 1024).toFixed(1)}MB 且無法自動縮小）`)
          continue
        }
        mimeType = shrunk.mimeType
        dataUrl = shrunk.dataUrl
        downscaled = true
      } else {
        dataUrl = await readAsDataUrl(file)
      }

      const data = dataUrl.slice(dataUrl.indexOf(',') + 1)
      accepted.push({
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name || '貼上的截圖.png',
        mimeType,
        data,
        previewUrl: mimeType === 'application/pdf' ? null : dataUrl,
        bytes: Math.floor(data.length * 0.75),
        downscaled,
      })
    }

    const room = Math.max(0, MAX_IMAGES - filesRef.current.length)
    if (accepted.length > room)
      rejected.push(`最多只能上傳 ${MAX_IMAGES} 張（多餘的已略過）`)
    const admitted = accepted.slice(0, room)
    if (admitted.length > 0) setFiles((prev) => [...prev, ...admitted])
    if (rejected.length > 0) setError(rejected.join('；'))
  }, [])

  // Screenshot -> Win+Shift+S -> Ctrl+V straight onto the page is the
  // fastest path for the flow this exists to serve, so paste is a
  // first-class input, not just a nicety. Bound to the window rather than
  // a focused element because there is nothing natural to focus first.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const pasted = Array.from(e.clipboardData?.files ?? [])
      if (pasted.length === 0) return
      e.preventDefault()
      void addFiles(pasted)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  const removeFile = (key: string) => {
    setFiles((prev) => prev.filter((f) => f.key !== key))
    setError(null)
  }

  /**
   * Copies one half of the prompt this component would have sent, for
   * pasting into a chat GUI with the screenshot attached by hand.
   *
   * The escape hatch for a spent Gemini quota: the JSON that comes back
   * from the GUI goes into the same textarea below, so the review step is
   * identical -- only who calls the model changes.
   *
   * The halves stay separate all the way to the clipboard because a GUI
   * with a system-instruction field reproduces the API call exactly when
   * each one goes in its own box. In a single-box GUI they can be pasted
   * one after the other.
   *
   * Refetched on every click rather than cached: the note and the file
   * count feed the user half, so a cached copy would go stale as soon as
   * the note was edited -- and a stale prompt copies successfully, which
   * is the worst way for this to break.
   *
   * Deliberately not disabled when no file is picked: the screenshot gets
   * attached in the GUI, not here. The count is still sent when files are
   * present, because the prompt says something different for several
   * crops of one question.
   */
  const handleCopyPrompt = async (part: PromptPart) => {
    if (copying !== null) return
    setCopying(part)
    setError(null)
    setPromptFallback(null)
    let text: string
    try {
      const res = await apiFetch<Record<PromptPart, string>>('question/image/prompt', {
        subjectId,
        imageCount: files.length === 0 ? 1 : files.length,
        note: note.trim() === '' ? undefined : note.trim(),
      })
      text = res[part]
    } catch (e) {
      setCopying(null)
      setError(describeCopyPromptError(e))
      return
    }
    // Separated from the fetch above: a clipboard rejection (insecure
    // context, denied permission) is not a failed request, and treating
    // it as one would throw away text that arrived perfectly well.
    try {
      await navigator.clipboard.writeText(text)
      setCopying(null)
      setCopied(part)
      // Guarded so that copying the other half next is not cleared early
      // by this timer firing after it.
      window.setTimeout(() => setCopied((current) => (current === part ? null : current)), 2000)
    } catch {
      setCopying(null)
      setPromptFallback(text)
      setError('無法寫入剪貼簿，請從下方框內自行複製。')
    }
  }

  const handleRecognize = async () => {
    if (files.length === 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await apiPost<QuestionImageResponse>('question/image', {
        subjectId,
        images: files.map((f) => ({ mimeType: f.mimeType, data: f.data })),
        note: note.trim() === '' ? undefined : note.trim(),
      })
      if (res.questions.length === 0) {
        setError('AI 沒有從圖片中辨識出題目，請確認截圖是否完整或加上補充說明。')
        return
      }
      onQuestions(JSON.stringify(res.questions, null, 2))
    } catch (e) {
      setError(describeRecognizeError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-spirit-card border border-brown-300 bg-white/40 p-6">
      <h2 className="mb-1 text-lg font-bold text-black-900">上傳題目截圖（AI 辨識）</h2>
      <p className="mb-4 text-sm text-black-500">
        上傳「一道題目」的截圖或 PDF，AI 會辨識成題目 JSON 並自動填入下方欄位。
        同一題若分成多張截圖（例如題目與選項分開），可一次上傳最多 {MAX_IMAGES} 張，會合併為一題。
        也可以直接按 Ctrl+V 貼上剪貼簿中的截圖。
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void addFiles(Array.from(e.dataTransfer.files))
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition ${
          dragging ? 'border-blue-700 bg-blue-700/5' : 'border-brown-300 hover:bg-beige-200/50'
        }`}
      >
        <p className="text-sm text-black-700">點擊選擇檔案，或將截圖拖曳至此</p>
        <p className="mt-1 text-xs text-black-300">
          支援 PNG / JPEG / WebP / HEIC / PDF，單檔超過 {(MAX_IMAGE_BYTES / 1024 / 1024).toFixed(1)}MB 會自動縮小
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_MIME_TYPES.join(',')}
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []))
            // Lets the same file be picked again after being removed.
            e.target.value = ''
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-3">
          {files.map((file) => (
            <li
              key={file.key}
              className="relative w-32 rounded-lg border border-brown-300 bg-white p-2"
            >
              {file.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={file.previewUrl}
                  alt={file.name}
                  className="h-20 w-full rounded object-contain"
                />
              ) : (
                <div className="flex h-20 w-full items-center justify-center rounded bg-beige-200 text-xs text-black-500">
                  PDF
                </div>
              )}
              <p className="mt-1 truncate text-spirit-micro text-black-500" title={file.name}>
                {file.name}
              </p>
              <p className="text-spirit-micro text-black-300">
                {(file.bytes / 1024).toFixed(0)} KB{file.downscaled && '（已縮小）'}
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeFile(file.key)
                }}
                className="absolute -top-2 -right-2 h-5 w-5 rounded-full border border-brown-300 bg-white text-xs leading-none text-black-700 transition hover:bg-red-50 hover:text-red-600"
                aria-label={`移除 ${file.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-col gap-1">
        <label className="text-sm font-medium text-black-700">補充說明（選填）</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          // Matches the server's note cap -- without it an over-long note
          // comes back as a 400 that reads as though the image was at fault.
          maxLength={1000}
          placeholder="例如：答案是 B、這題的圖表請忽略"
          className="w-full rounded-lg border border-brown-300 bg-white px-3 py-2 text-sm text-black-900"
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleRecognize}
          disabled={files.length === 0 || busy}
          className="rounded-md bg-blue-700 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-spirit-forest disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'AI 辨識中…' : 'AI 辨識'}
        </button>
        {files.length > 0 && !busy && (
          <button
            type="button"
            onClick={() => {
              setFiles([])
              setError(null)
            }}
            className="text-sm text-black-500 underline transition hover:text-black-900"
          >
            清除
          </button>
        )}
        {busy && <span className="text-xs text-black-300">辨識需要幾秒鐘，請勿離開此頁</span>}
      </div>

      {/* The manual route, kept visually secondary -- it is the fallback
          for a spent quota, not the normal way to add a question. */}
      <div className="mt-4 border-t border-brown-300 pt-4">
        <div className="flex flex-wrap items-center gap-3">
          {PROMPT_PARTS.map(({ part, label }) => (
            <button
              key={part}
              type="button"
              onClick={() => void handleCopyPrompt(part)}
              disabled={copying !== null}
              className="rounded-md border border-brown-300 px-4 py-2 text-sm text-black-700 transition hover:bg-beige-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copying === part ? '取得中…' : copied === part ? '已複製 ✓' : label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-black-500">
          AI 額度用完時，把這兩段貼到 ChatGPT／Gemini 網頁版（有系統指示欄位就分開貼，否則依序貼在
          同一個對話框），自行附上截圖，再把回傳的 JSON 貼到下方欄位。
        </p>
        {promptFallback !== null && (
          <textarea
            readOnly
            value={promptFallback}
            onFocus={(e) => e.currentTarget.select()}
            rows={8}
            className="mt-3 w-full rounded-md border border-brown-300 bg-white/60 p-2 font-mono text-xs text-black-800"
          />
        )}
      </div>
    </section>
  )
}
