'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiPost } from '@/lib/api'

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
// The server caps the base64 string at 2,500,000 characters; base64 costs
// 4 bytes per 3, so this is the largest file that can survive encoding.
const MAX_BYTES = Math.floor((2_500_000 * 3) / 4)

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

const readAsDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('decode failed'))
    img.src = url
  })

/**
 * Shrinks an oversized image until it fits under MAX_BYTES.
 *
 * Worth doing rather than just rejecting: a phone photo of a question, or
 * a screenshot from a high-DPI display, routinely lands at 3-5MB, and
 * "your file is too big" with no recourse would make the feature useless
 * for exactly the inputs it is meant for. Re-encodes to JPEG because a
 * screenshot PNG stays large even at half the pixels; quality 0.9 keeps
 * small text legible, which is the whole job here.
 *
 * Returns null if it can't be decoded as an image (a PDF, mainly) -- those
 * the caller rejects outright, since there is no cheap way to shrink one
 * in the browser.
 */
const downscaleToLimit = async (
  file: File
): Promise<{ mimeType: string; dataUrl: string } | null> => {
  let objectUrl: string | null = null
  try {
    objectUrl = URL.createObjectURL(file)
    const img = await loadImage(objectUrl)

    let scale = 1
    // Each pass drops to 75% per side, so ~56% of the area. Five passes
    // reach ~5% of the original, which takes any realistic photo under the
    // cap; the bound stops a pathological input looping forever.
    for (let attempt = 0; attempt < 5; attempt++) {
      scale *= 0.75
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
      // 4 base64 chars per 3 bytes, ignoring the data: prefix.
      const bytes = Math.floor((dataUrl.split(',')[1]?.length ?? 0) * 0.75)
      if (bytes <= MAX_BYTES) return { mimeType: 'image/jpeg', dataUrl }
    }
    return null
  } catch {
    return null
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
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

      if (file.size > MAX_BYTES) {
        const shrunk = await downscaleToLimit(file)
        if (!shrunk) {
          rejected.push(`${file.name || '檔案'}（超過 ${(MAX_BYTES / 1024 / 1024).toFixed(1)}MB 且無法自動縮小）`)
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
      // apiPost only surfaces the status code, so the AI_* codes the
      // server distinguishes all arrive here as one 502 -- worth telling
      // them apart from a rejected upload, which is the admin's to fix.
      const message = e instanceof Error ? e.message : String(e)
      if (message.includes('502'))
        setError('AI 辨識失敗或回傳格式不正確，請再試一次，或換一張更清楚的截圖。')
      else if (message.includes('400'))
        setError('圖片格式或大小不符，或此科目尚未建立觀念（需先新增觀念才能辨識）。')
      else if (message.includes('404')) setError('找不到此科目。')
      else setError(`辨識失敗：${message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-[24px] border border-brown-300 bg-white/40 p-6">
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
          支援 PNG / JPEG / WebP / HEIC / PDF，單檔超過 {(MAX_BYTES / 1024 / 1024).toFixed(1)}MB 會自動縮小
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
              <p className="mt-1 truncate text-[11px] text-black-500" title={file.name}>
                {file.name}
              </p>
              <p className="text-[11px] text-black-300">
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
          className="rounded-md bg-blue-700 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#1f3ea3] disabled:cursor-not-allowed disabled:opacity-50"
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
    </section>
  )
}
