'use client'

import { useMemo, useState } from 'react'
import { ApiError, apiPost } from '@/lib/api'
import { toApiImage } from '@/lib/imageFile'

// Mirrors backend_new's QUESTION_FIGURE_MIME_TYPES, which is narrower than
// what the screenshot uploader accepts: a figure ends up in an <img> a
// student looks at, so PDF (not a valid img source) and HEIC/HEIF (decode
// only on Apple platforms) are out, however happily they would upload.
const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Matches a placeholder the extraction prompt left behind, scheme and all.
 *
 * The scheme has to be part of the match: the prompt writes
 * `src="https://img-placeholder-1"`, so replacing only the
 * `img-placeholder-1` part would leave `https://` glued to the front of
 * the real URL and produce `https://https://bucket...`. Optional, because
 * a reply that omitted the scheme should still be fixable.
 */
const PLACEHOLDER_PATTERN = /(?:https?:\/\/)?img-placeholder-\d+/g

const describeFigureError = (e: unknown): string => {
  if (!(e instanceof ApiError))
    return `上傳失敗：${e instanceof Error ? e.message : String(e)}`
  if (e.status === 400) return '圖片格式或大小不符（僅接受 JPG／PNG／WebP）。'
  if (e.status === 401 || e.status === 403) return '需要管理員權限才能上傳圖片。'
  if (e.status === 429) return '上傳過於頻繁，請稍等一下再試。'
  return `上傳失敗（${e.status}），請再試一次。`
}

/**
 * Replaces the figure placeholders in a question draft with real URLs.
 *
 * Shown only while the pasted JSON still holds a placeholder, because
 * that is exactly the window in which it can be fixed: once the admin
 * submits, the broken img is stored on the question. `missingFields` in
 * the page blocks that submit, so this panel is the way out of the block
 * rather than an optional extra.
 *
 * Works on the JSON text rather than the parsed objects so it can run
 * while the draft is still being hand-edited (and therefore possibly
 * unparseable), and so the admin sees their own formatting preserved.
 */
export default function QuestionFigurePanel({
  questionsJson,
  onReplace,
}: {
  questionsJson: string
  /** Receives the JSON with every occurrence of one placeholder swapped. */
  onReplace: (next: string) => void
}) {
  // Which placeholder is uploading, and the last error, keyed by token so
  // two placeholders report independently.
  const [busyToken, setBusyToken] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Distinct, in the order they appear -- that is the order the figures
  // appear in the question, which is how the admin knows which crop goes
  // where.
  const tokens = useMemo(() => {
    const found = questionsJson.match(PLACEHOLDER_PATTERN) ?? []
    return [...new Set(found)]
  }, [questionsJson])

  if (tokens.length === 0) return null

  const handlePick = async (token: string, file: File | undefined) => {
    if (!file || busyToken !== null) return
    setErrors((prev) => ({ ...prev, [token]: '' }))

    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      setErrors((prev) => ({ ...prev, [token]: '僅接受 JPG／PNG／WebP。' }))
      return
    }

    setBusyToken(token)
    try {
      const image = await toApiImage(file)
      if (!image) {
        setErrors((prev) => ({ ...prev, [token]: '圖片太大且無法自動縮小，請自行縮圖後再試。' }))
        return
      }

      const { url } = await apiPost<{ url: string }, typeof image>(
        'question/image/figure',
        image
      )

      // Replaced with a lookahead rather than a plain string replace:
      // without it, swapping img-placeholder-1 would also rewrite the
      // front of img-placeholder-10 and corrupt it.
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      onReplace(questionsJson.replace(new RegExp(`${escaped}(?!\\d)`, 'g'), url))
    } catch (e) {
      setErrors((prev) => ({ ...prev, [token]: describeFigureError(e) }))
    } finally {
      setBusyToken(null)
    }
  }

  return (
    <section className="rounded-spirit-card border border-amber-300 bg-amber-50/60 p-4">
      <h3 className="text-sm font-bold text-black-900">
        待補圖片（{tokens.length}）
      </h3>
      <p className="mt-1 text-xs text-black-700">
        AI 無法轉錄題目中的圖表，先留下佔位。請自行從原卷截圖（Win+Shift+S）後依序上傳，上傳完會自動把
        JSON 裡的佔位換成網址。補完才能送出。
      </p>

      <ul className="mt-3 space-y-2">
        {tokens.map((token) => (
          <li key={token} className="flex flex-wrap items-center gap-3">
            <code className="rounded bg-white/70 px-2 py-1 font-mono text-xs text-black-800">
              {token}
            </code>
            <input
              type="file"
              accept={ACCEPTED_MIME_TYPES.join(',')}
              disabled={busyToken !== null}
              onChange={(e) => {
                const file = e.target.files?.[0]
                // Cleared so picking the same file again after an error
                // still fires a change event.
                e.target.value = ''
                void handlePick(token, file)
              }}
              className="text-xs text-black-700 file:mr-2 file:rounded-md file:border file:border-brown-300 file:bg-white file:px-3 file:py-1 file:text-xs file:text-black-700 disabled:opacity-50"
            />
            {busyToken === token && <span className="text-xs text-black-500">上傳中…</span>}
            {errors[token] && <span className="text-xs text-red-600">{errors[token]}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
