'use client'

import { useEffect, useState } from 'react'
import { MathJax } from 'better-react-mathjax'
import { BookOpenText } from 'lucide-react'
import { apiFetch, LIMIT } from '@/lib/api'
import Chip, { tagColors } from '@/components/Chip'
import DifficultyStars from '@/components/DifficultyStars'
import { LoadingState } from '@/components/ui'
import type { GetReplyResponse, ReplyGroup } from '@/types/api'
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

function getFbUrl(fbPostId: string | null): string | null {
  if (!fbPostId) return null
  const [pageId, postId] = fbPostId.split('_')
  if (!pageId || !postId) return null
  return `https://m.facebook.com/${pageId}/posts/${postId}`
}

function ReplyRow({ item }: { item: ReplyGroup }) {
  // For a group, parentQuestion is the 題組 header.
  // For a standalone question, parentQuestion is null and children has one entry.
  const question = item.parentQuestion ?? item.children[0]?.question
  if (!question) return null

  const exams = question.exam ?? []
  const concepts = question.concept ?? []
  const tags = question.tag ?? []
  const difficulty = question.adjustedDifficulty ?? question.difficulty ?? 0
  const fbUrl = getFbUrl(question.fbPostId)
  const isGroup = item.parentQuestion !== null

  const MetaChips = () => (
    <>
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
    </>
  )

  return (
    <article className={styles.recordCard}>
      {/* Header */}
      <div className={styles.cardHeader}>
        <div className="flex items-center justify-between gap-3 sm:hidden">
          <span className={`${styles.subjectName} flex items-center gap-2`}>
            <BookOpenText size={20} strokeWidth={2.5} className={`${styles.subjectIcon} shrink-0`} />
            {item.subject.name}
          </span>
          <DifficultyStars value={difficulty} tone="forest" />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2 sm:hidden">
          <MetaChips />
        </div>
        <div className="hidden sm:flex sm:items-start sm:justify-between sm:gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`${styles.subjectName} flex shrink-0 items-center gap-2`}>
              <BookOpenText size={20} strokeWidth={2.5} className={`${styles.subjectIcon} shrink-0`} />
              {item.subject.name}
            </span>
            <div className="ml-2 flex flex-wrap gap-2">
              <MetaChips />
            </div>
          </div>
          <DifficultyStars value={difficulty} tone="forest" />
        </div>
      </div>

      {/* Body */}
      <div className={styles.cardBody}>
        {/* Parent / standalone question content */}
        {question.content && (
          <div
            dangerouslySetInnerHTML={{ __html: question.content }}
            className="prose max-w-none text-spirit-reading font-medium text-black-800 [&>*:last-child]:mb-0"
          />
        )}

        {/* Sub-questions (for 題組) or single answer block */}
        <div className={`flex flex-col ${isGroup ? 'gap-6' : 'gap-0'}`}>
          {item.children.map((child, idx) => {
            const correct = child.score > 0
            const childQ = isGroup ? child.question : null
            return (
              <div key={child.id} className={isGroup ? styles.subQuestion : ''}>
                {childQ?.content && (
                  <div
                    dangerouslySetInnerHTML={{ __html: childQ.content }}
                    className="prose prose-sm mb-4 max-w-none text-black-800 [&>*:last-child]:mb-0"
                  />
                )}
                <div
                  className={`${styles.statusPanel} ${correct ? styles.statusCorrect : styles.statusWrong}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-2 text-base text-black-700 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
                      {isGroup && (
                        <div className="text-sm font-medium text-black-500">第 {idx + 1} 題</div>
                      )}
                      <div>
                        作答時間：
                        <span className="font-medium text-black-900">{formatDate(child.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div>
                          作答：
                          <span className={styles.value}>
                            {child.repliedAnswer ?? '—'}
                          </span>
                        </div>
                        <div>
                          得分：
                          <span
                            className={`${styles.value} ${correct ? styles.valueCorrect : styles.valueWrong}`}
                          >
                            {child.score}
                          </span>
                        </div>
                      </div>
                    </div>

                    {!isGroup && (
                      <a
                        href={fbUrl ?? undefined}
                        target={fbUrl ? '_blank' : undefined}
                        rel={fbUrl ? 'noopener noreferrer' : undefined}
                        aria-disabled={!fbUrl}
                        onClick={(e) => { if (!fbUrl) e.preventDefault() }}
                        className={`${styles.discussionButton} ${fbUrl ? '' : 'cursor-not-allowed opacity-40'}`}
                      >
                        討論區
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M5.5 2.5H2.5C1.95 2.5 1.5 2.95 1.5 3.5V11.5C1.5 12.05 1.95 12.5 2.5 12.5H10.5C11.05 12.5 11.5 12.05 11.5 11.5V8.5M8.5 1.5H12.5M12.5 1.5V5.5M12.5 1.5L6 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* 討論區 link for group (shown once at bottom), disabled rather than hidden when there's no fbUrl */}
        {isGroup && (
          <a
            href={fbUrl ?? undefined}
            target={fbUrl ? '_blank' : undefined}
            rel={fbUrl ? 'noopener noreferrer' : undefined}
            aria-disabled={!fbUrl}
            onClick={(e) => { if (!fbUrl) e.preventDefault() }}
            className={`${styles.discussionButton} self-end ${fbUrl ? '' : 'cursor-not-allowed opacity-40'}`}
          >
            討論區
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5.5 2.5H2.5C1.95 2.5 1.5 2.95 1.5 3.5V11.5C1.5 12.05 1.95 12.5 2.5 12.5H10.5C11.05 12.5 11.5 12.05 11.5 11.5V8.5M8.5 1.5H12.5M12.5 1.5V5.5M12.5 1.5L6 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        )}
      </div>
    </article>
  )
}

// Filters are owned by ReplyTabsClient (via useSharedFilters) and shared
// with the 錯題本 tab -- this component only turns them into a fetch.
export default function ReplyClient({
  filters,
  onLoadingChange,
}: {
  filters: QueryFilters
  onLoadingChange: (loading: boolean) => void
}) {
  const [replyList, setReplyList] = useState<GetReplyResponse | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = async (p: number) => {
    setLoading(true)
    onLoadingChange(true)
    try {
      const data = await apiFetch<GetReplyResponse>('reply', {
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
      setReplyList(data)
      setPage(p)
    } catch {
      setError('無法載入答題紀錄，請確認已登入。')
    } finally {
      setLoading(false)
      onLoadingChange(false)
    }
  }

  // examIds/tagIds are always reset together with subjectId (see
  // useSharedFilters), so by the time this effect's dependencies change,
  // they're already mutually consistent. Keying on the joined id strings
  // (not the arrays themselves) avoids a spurious refire when a reset
  // creates a new but equally-empty array.
  const examIdsKey = filters.examIds.join(',')
  const tagIdsKey = filters.tagIds.join(',')

  useEffect(() => {
    fetchPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.categoryId, filters.subjectId, examIdsKey, tagIdsKey])

  if (loading && !replyList) {
    return <LoadingState />
  }

  if (error) {
    return (
      <div className={styles.errorState}>
        <p className={styles.errorText}>{error}</p>
        <a
          href="/"
          className={`${styles.loginLink} mt-4 inline-block`}
        >
          回首頁登入
        </a>
      </div>
    )
  }

  const isEmpty = !replyList || replyList.data.length === 0

  return (
    <div>
      <p className={styles.description}>回顧每次練習的題目、作答與得分。</p>

      {isEmpty ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>
            {filters.hasActiveFilters ? '沒有符合篩選條件的答題紀錄' : '尚無答題紀錄'}
          </p>
          {!filters.hasActiveFilters && (
            <a
              href="/adaptive"
              className={`${styles.primaryButton} mt-4 inline-block`}
            >
              開始智慧練習
            </a>
          )}
        </div>
      ) : (
        <>
          <MathJax dynamic>
            <div className={styles.cardList}>
              {replyList.data.map((item) => (
                <ReplyRow key={`${item.repliedAt}|${item.children[0]?.parentId ?? item.children[0]?.questionId}`} item={item} />
              ))}
            </div>
          </MathJax>

          {replyList.paginate.totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                onClick={() => fetchPage(page - 1)}
                disabled={page === 1 || loading}
                className={styles.paginationButton}
              >
                ← 上一頁
              </button>
              <span className={styles.paginationText}>
                第 {page} / {replyList.paginate.totalPages} 頁
              </span>
              <button
                onClick={() => fetchPage(page + 1)}
                disabled={page === replyList.paginate.totalPages || loading}
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
