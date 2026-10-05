'use client'

import { useEffect, useState } from 'react'
import { MathJax } from 'better-react-mathjax'
import { BookOpenText } from 'lucide-react'
import { apiDelete, apiFetch, apiPut, LIMIT } from '@/lib/api'
import Chip, { tagColors } from '@/components/Chip'
import DifficultyStars from '@/components/DifficultyStars'
import type { GetWrongQuestionResponse, PutWrongQuestionNoteResponse, WrongQuestion } from '@/types/api'
import type { QueryFilters } from './useSharedFilters'
import styles from './reply.module.css'

const typeLabel: Record<string, string> = {
  SINGLE: '單選題',
  MULTIPLE: '多選題',
  TRUE_FALSE: '是非題',
  FILL: '選填題',
  GROUP: '題組',
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function WrongCard({
  item,
  onSaveNote,
  onDelete,
}: {
  item: WrongQuestion
  onSaveNote: (id: number, note: string | null) => Promise<void>
  onDelete: (id: number) => Promise<void>
}) {
  // For a GROUP question's child, parentQuestion is the 題組 header and
  // question is the specific child that was answered wrong -- unlike
  // /reply's history view, there's no need to list every sibling child
  // here, since this row only ever represents the one question the user
  // got wrong.
  const question = item.question
  const isGroup = item.parentQuestion !== null

  const exams = question.exam ?? []
  const concepts = question.concept ?? []
  const tags = question.tag ?? []
  const difficulty = question.adjustedDifficulty ?? question.difficulty ?? 0

  const [note, setNote] = useState(item.note ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const noteChanged = note !== (item.note ?? '')

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSaveNote(item.id, note.trim() === '' ? null : note)
    } catch {
      alert('儲存註記失敗，請稍後再試。')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('確定要從錯題本移除這一題嗎？')) return
    setDeleting(true)
    try {
      await onDelete(item.id)
    } catch {
      alert('刪除失敗，請稍後再試。')
      setDeleting(false)
    }
  }

  return (
    <article className={styles.recordCard}>
      <div className={styles.cardHeader}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`${styles.subjectName} flex shrink-0 items-center gap-2`}>
              <BookOpenText size={20} strokeWidth={2.5} className={`${styles.subjectIcon} shrink-0`} />
              {item.subject.name}
            </span>
            <div className="ml-2 flex flex-wrap gap-2">
              <Chip label={typeLabel[question.type] ?? question.type} />
              {exams.map((e) => (
                <Chip key={e.id} label={e.name} color={tagColors.exam} />
              ))}
              {concepts.map((c) => (
                <Chip
                  key={c.id}
                  label={c.conceptGroup.name === c.name ? c.name : c.conceptGroup.name + '-' + c.name}
                  color={tagColors.concept}
                />
              ))}
              {tags.map((t) => (
                <Chip key={t.id} label={t.name} color={tagColors.tag} />
              ))}
            </div>
          </div>
          <DifficultyStars value={difficulty} tone="forest" />
        </div>
      </div>

      <div className={styles.cardBody}>
        {isGroup && item.parentQuestion?.content && (
          <div
            dangerouslySetInnerHTML={{ __html: item.parentQuestion.content }}
            className="prose max-w-none text-[18px] font-medium text-black-800 [&>*:last-child]:mb-0"
          />
        )}
        {question.content && (
          <div
            dangerouslySetInnerHTML={{ __html: question.content }}
            className="prose max-w-none text-[18px] font-medium text-black-800 [&>*:last-child]:mb-0"
          />
        )}

        {question.answer && (
          <div className="text-base text-black-700">
            正確答案：
            <span className={styles.value}>
              {question.answer}
            </span>
          </div>
        )}

        <div className={`${styles.statusPanel} ${styles.statusWrong}`}>
          <div className="flex flex-col gap-2 text-base text-black-700 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
            <div>
              最後答錯時間：
              <span className="font-medium text-black-900">{formatDate(item.lastWrongAt)}</span>
            </div>
            <div className="flex items-center gap-4">
              <div>
                得分：
                <span className={`${styles.value} ${styles.valueWrong}`}>
                  {item.score}
                </span>
              </div>
              <div>
                答錯次數：
                <span className={`${styles.value} ${styles.valueWrong}`}>
                  {item.wrongCount}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-black-700">我的註記</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="寫下這題錯在哪裡、下次要注意什麼…"
            rows={2}
            className={styles.noteInput}
          />
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={handleSave}
            disabled={saving || !noteChanged}
            className={styles.primaryButton}
          >
            {saving ? '儲存中…' : '儲存註記'}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className={styles.dangerButton}
          >
            {deleting ? '移除中…' : '從錯題本移除'}
          </button>
        </div>
      </div>
    </article>
  )
}

// Filters are owned by ReplyTabsClient (via useSharedFilters) and shared
// with the 歷史紀錄 tab -- this component only turns them into a fetch.
export default function WrongClient({
  filters,
  onLoadingChange,
}: {
  filters: QueryFilters
  onLoadingChange: (loading: boolean) => void
}) {
  const [list, setList] = useState<GetWrongQuestionResponse | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = async (p: number) => {
    setLoading(true)
    onLoadingChange(true)
    try {
      const data = await apiFetch<GetWrongQuestionResponse>('wrong-question', {
        offset: p > 1 ? (p - 1) * LIMIT : undefined,
        limit: LIMIT,
        // subjectId already implies its category, so categoryId is only sent
        // when no subject is picked yet (browsing "every subject in this
        // category") -- sending both would just make the backend resolve
        // the same subject set twice for no extra filtering effect.
        categoryId: filters.subjectId ? undefined : filters.categoryId || undefined,
        subjectId: filters.subjectId || undefined,
        examIds: filters.examIds.length ? filters.examIds.join(',') : undefined,
        tagIds: filters.tagIds.length ? filters.tagIds.join(',') : undefined,
      })
      setList(data)
      setPage(p)
    } catch {
      setError('無法載入錯題本，請確認已登入。')
    } finally {
      setLoading(false)
      onLoadingChange(false)
    }
  }

  const examIdsKey = filters.examIds.join(',')
  const tagIdsKey = filters.tagIds.join(',')

  useEffect(() => {
    fetchPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.categoryId, filters.subjectId, examIdsKey, tagIdsKey])

  const handleSaveNote = async (id: number, note: string | null) => {
    const updated = await apiPut<PutWrongQuestionNoteResponse, { note: string | null }>(`wrong-question/${id}/note`, {
      note,
    })
    setList((prev) =>
      prev ? { ...prev, data: prev.data.map((item) => (item.id === id ? { ...item, note: updated.note } : item)) } : prev
    )
  }

  const handleDelete = async (id: number) => {
    await apiDelete(`wrong-question/${id}`)
    // Refetch rather than splice the item out locally -- deleting the
    // last row on a page should pull in the next page's item (or show the
    // empty state), not just leave a shorter page.
    const nextPage = list && list.data.length === 1 && page > 1 ? page - 1 : page
    await fetchPage(nextPage)
  }

  if (loading && !list) {
    return (
      <div className="flex h-48 items-center justify-center">
        <span className="text-sm text-black-500">載入中…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.errorState}>
        <p className={styles.errorText}>{error}</p>
        <a href="/" className={`${styles.loginLink} mt-4 inline-block`}>
          回首頁登入
        </a>
      </div>
    )
  }

  const isEmpty = !list || list.data.length === 0

  return (
    <div>
      <p className={styles.description}>作答時未拿到滿分的題目會自動收錄在這裡，答對後也不會自動移除，你可以自己加註記或移除。</p>

      {isEmpty ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>
            {filters.hasActiveFilters ? '沒有符合篩選條件的錯題' : '目前沒有錯題，繼續保持！'}
          </p>
        </div>
      ) : (
        <>
          <MathJax dynamic>
            <div className={styles.cardList}>
              {list.data.map((item) => (
                <WrongCard key={item.id} item={item} onSaveNote={handleSaveNote} onDelete={handleDelete} />
              ))}
            </div>
          </MathJax>

          {list.paginate.totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                onClick={() => fetchPage(page - 1)}
                disabled={page === 1 || loading}
                className={styles.paginationButton}
              >
                ← 上一頁
              </button>
              <span className={styles.paginationText}>
                第 {page} / {list.paginate.totalPages} 頁
              </span>
              <button
                onClick={() => fetchPage(page + 1)}
                disabled={page === list.paginate.totalPages || loading}
                className={styles.paginationButton}
              >
                下一頁 →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
