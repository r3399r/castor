'use client'

import { useEffect, useState } from 'react'
import { MathJax } from 'better-react-mathjax'
import { BookOpenText, ChevronDown, ChevronUp } from 'lucide-react'
import { apiDelete, apiFetch, apiPut, LIMIT } from '@/lib/api'
import Chip, { tagColors } from '@/components/Chip'
import DifficultyStars from '@/components/DifficultyStars'
import Pagination from '@/components/Pagination'
import { Button, EmptyState, ErrorState, LoadingState } from '@/components/ui'
import { formatNumber } from '@/lib/number'
import { blankNumberFromContent, markBlanksInPassage } from '@/lib/questionBlank'
import type {
  GetWrongQuestionResponse,
  PutWrongQuestionNoteResponse,
  WrongQuestion,
  WrongQuestionEntry,
} from '@/types/api'
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

/**
 * One wrong sub-question inside a card.
 *
 * Its own component, at module scope, because each one owns a note draft
 * and a pending state -- declaring it inside WrongCard would give React a
 * new component type on every render and remount the textarea, losing
 * whatever was being typed.
 */
function WrongEntry({
  entry,
  isGroup,
  position,
  siblingCount,
  blankNumber,
  onSaveNote,
  onDelete,
}: {
  entry: WrongQuestionEntry
  isGroup: boolean
  /** 1-based position among the 題組's sub-questions, 0 when unknown. */
  position: number
  siblingCount: number
  /**
   * The blank this sub-question stands for, when its content is only that
   * number *and* the blank was found and highlighted in the passage above.
   * null means render the content normally -- including when the content
   * is a bare number we failed to locate, since the number is then all the
   * reader has to go on.
   */
  blankNumber: number | null
  onSaveNote: (id: number, note: string | null) => Promise<void>
  onDelete: (id: number) => Promise<void>
}) {
  const question = entry.question
  const difficulty = question.adjustedDifficulty ?? question.difficulty ?? 0

  const [note, setNote] = useState(entry.note ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const noteChanged = note !== (entry.note ?? '')

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSaveNote(entry.id, note.trim() === '' ? null : note)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete(entry.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={isGroup ? 'border-t border-brown-300/40 pt-4' : ''}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Chip label={typeLabel[question.type] ?? question.type} />
          {isGroup && position > 0 && (
            <span className="text-xs whitespace-nowrap text-black-500">
              題組第 {position} 題／共 {siblingCount} 題
            </span>
          )}
        </div>
        <DifficultyStars value={difficulty} tone="forest" />
      </div>

      {blankNumber !== null ? (
        <div className="text-base text-black-700">
          本題為文章中標示的第
          <span className={`${styles.value} mx-1`}>{blankNumber}</span>格
        </div>
      ) : (
        question.content && (
          <div
            dangerouslySetInnerHTML={{ __html: question.content }}
            className="prose max-w-none text-spirit-reading font-medium text-black-800 [&>*:last-child]:mb-0"
          />
        )
      )}

      {question.answer && (
        <div className="mt-2 text-base text-black-700">
          正確答案：
          <span className={styles.value}>{question.answer}</span>
        </div>
      )}

      <div className={`${styles.statusPanel} ${styles.statusWrong} mt-3`}>
        <div className="flex flex-col gap-2 text-base text-black-700 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
          <div>
            最後答錯時間：
            <span className="font-medium text-black-900">{formatDate(entry.lastWrongAt)}</span>
          </div>
          <div className="flex items-center gap-4">
            <div>
              得分：
              <span className={`${styles.value} ${styles.valueWrong}`}>{entry.score}</span>
            </div>
            <div>
              答錯次數：
              <span className={`${styles.value} ${styles.valueWrong}`}>
                {formatNumber(entry.wrongCount)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <label className="text-sm font-bold text-black-700">我的註記</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="寫下這題錯在哪裡、下次要注意什麼…"
          rows={2}
          className={styles.noteInput}
        />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <Button onClick={handleSave} disabled={saving || !noteChanged} loading={saving}>
          {saving ? '儲存中…' : '儲存註記'}
        </Button>
        <Button variant="danger" onClick={handleDelete} disabled={deleting} loading={deleting}>
          {deleting ? '移除中…' : '從錯題本移除'}
        </Button>
      </div>
    </div>
  )
}

/**
 * One top-level question and every sub-question of it the user got wrong.
 *
 * A 題組 used to produce one card per wrong child, each repeating the
 * whole passage -- four wrong sub-questions of one reading comprehension
 * meant the same passage four times over. Now the passage appears once,
 * with the wrong sub-questions listed under it in the order they appear
 * in the paper. A standalone question arrives as a group of one and reads
 * the same as it always did.
 */
function WrongCard({
  item,
  onSaveNote,
  onDelete,
}: {
  item: WrongQuestion
  onSaveNote: (id: number, note: string | null) => Promise<void>
  onDelete: (id: number) => Promise<void>
}) {
  const isGroup = item.parentQuestion !== null

  // exam/concept/tag links only ever live on a question's top-level row,
  // so for a 題組 they sit on the parent -- a child has none of its own to
  // find. These used to be read off the child, which meant group cards
  // showed no exam, concept or tag at all, while the filter panel filtered
  // on exactly those links (the server resolves them against the parent).
  // You could filter by 學測 and get cards with no 學測 chip on them.
  const metaSource = item.parentQuestion ?? item.entries[0]?.question
  const exams = metaSource?.exam ?? []
  const concepts = metaSource?.concept ?? []
  const tags = metaSource?.tag ?? []

  // Positions come from the parent's full child list, so an entry can say
  // "第 2 題／共 5 題" even when only one of the five went wrong. By
  // position rather than sortOrder + 1: the stored values are only
  // 0-based by convention, and anything entered by hand could start at 1
  // and silently label the first sub-question 第 2 題.
  const siblings = item.parentQuestion?.children ?? []
  const positionById = new Map(siblings.map((child, i) => [child.id, i + 1]))

  // The whole card folds away, passage and sub-questions together -- the
  // list is long enough that scrolling past a finished 題組 is the common
  // case, and folding only the passage still left every sub-question, its
  // note box and its two buttons in the way. Open by default, so the page
  // reads the same as it always did until something is deliberately put
  // away. Per card and not persisted: a fold is for getting through this
  // page, not a setting.
  const [open, setOpen] = useState(true)
  const bodyId = `wrong-card-${item.id}`

  // 文意選填／篇章結構: each wrong sub-question is only a blank number, so
  // the blank gets highlighted in the passage and the sub-question says
  // which one it is instead of printing a lone "31". A number we cannot
  // find in the passage is left to render as it always did -- see
  // markBlanksInPassage for why only <u> blanks are matched.
  const blankNumbers = new Map(
    item.entries.map((entry) => [entry.id, blankNumberFromContent(entry.question.content)])
  )
  const passage = item.parentQuestion?.content ?? null
  const { html: passageHtml, marked: markedBlanks } = passage
    ? markBlanksInPassage(
        passage,
        [...blankNumbers.values()].filter((n): n is number => n !== null),
        styles.blankMark
      )
    : { html: null, marked: new Set<number>() }

  return (
    <article className={styles.recordCard}>
      <div className={styles.cardHeader}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`${styles.subjectName} flex shrink-0 items-center gap-2`}>
              <BookOpenText size={20} strokeWidth={2.5} className={`${styles.subjectIcon} shrink-0`} />
              {item.subject.name}
            </span>
            <div className="ml-2 flex flex-wrap gap-2">
              {isGroup && <Chip label="題組" />}
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

          <button
            type="button"
            onClick={() => setOpen((isOpen) => !isOpen)}
            aria-expanded={open}
            aria-controls={bodyId}
            className="flex shrink-0 items-center gap-1 rounded-md border border-brown-300 px-3 py-1.5 text-xs text-black-700 transition hover:bg-beige-200"
          >
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {open ? '收合' : isGroup ? `展開（${item.entries.length} 小題）` : '展開'}
          </button>
        </div>
      </div>

      {open && (
        <div id={bodyId} className={styles.cardBody}>
          {isGroup && passageHtml && (
            <div
              dangerouslySetInnerHTML={{ __html: passageHtml }}
              className="prose max-w-none text-spirit-reading font-medium text-black-800 [&>*:last-child]:mb-0"
            />
          )}

          {item.entries.map((entry) => {
            const blank = blankNumbers.get(entry.id) ?? null
            return (
              <WrongEntry
                key={entry.id}
                entry={entry}
                isGroup={isGroup}
                position={positionById.get(entry.question.id) ?? 0}
                siblingCount={siblings.length}
                blankNumber={blank !== null && markedBlanks.has(blank) ? blank : null}
                onSaveNote={onSaveNote}
                onDelete={onDelete}
              />
            )
          })}
        </div>
      )}
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
    // The id is a user_wrong_question row, which now sits on an entry
    // inside a group rather than on the page item itself -- so the patch
    // has to reach one level deeper than it used to.
    setList((prev) =>
      prev
        ? {
            ...prev,
            data: prev.data.map((group) => ({
              ...group,
              entries: group.entries.map((entry) =>
                entry.id === id ? { ...entry, note: updated.note } : entry
              ),
            })),
          }
        : prev
    )
  }

  const handleDelete = async (id: number) => {
    await apiDelete(`wrong-question/${id}`)
    // Refetch rather than splice the entry out locally -- deleting the
    // last one on a page should pull in the next page's group (or show
    // the empty state), not just leave a shorter page.
    //
    // Counted over entries, not groups: a page now holds groups, and
    // removing one sub-question of a 題組 that still has others left must
    // not send the user back a page.
    const entriesOnPage = list?.data.reduce((n, group) => n + group.entries.length, 0) ?? 0
    const nextPage = entriesOnPage === 1 && page > 1 ? page - 1 : page
    await fetchPage(nextPage)
  }

  if (loading && !list) {
    return <LoadingState />
  }

  if (error) {
    return (
      <ErrorState>
        <p>{error}</p>
        <a href="/" className={styles.loginLink}>
          回首頁登入
        </a>
      </ErrorState>
    )
  }

  const isEmpty = !list || list.data.length === 0

  return (
    <div>
      <p className={styles.description}>作答時未拿到滿分的題目會自動收錄在這裡，答對後也不會自動移除，你可以自己加註記或移除。</p>

      {isEmpty ? (
        <EmptyState>
          <p>
            {filters.hasActiveFilters ? '沒有符合篩選條件的錯題' : '目前沒有錯題，繼續保持！'}
          </p>
        </EmptyState>
      ) : (
        <>
          <MathJax dynamic>
            <div className={styles.cardList}>
              {list.data.map((item) => (
                <WrongCard key={item.id} item={item} onSaveNote={handleSaveNote} onDelete={handleDelete} />
              ))}
            </div>
          </MathJax>

          <Pagination
            page={page}
            totalPages={list.paginate.totalPages}
            onChange={fetchPage}
            disabled={loading}
            className="mt-6"
          />
        </>
      )}
    </div>
  )
}
