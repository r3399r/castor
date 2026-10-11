'use client'

import { useEffect, useState } from 'react'
import { MathJax } from 'better-react-mathjax'
import { BookOpenText } from 'lucide-react'
import { apiFetch, LIMIT } from '@/lib/api'
import Chip, { tagColors } from '@/components/Chip'
import DifficultyStars from '@/components/DifficultyStars'
import DiscussionLink from '@/components/DiscussionLink'
import Pagination from '@/components/Pagination'
import { ButtonLink, EmptyState, ErrorState, LoadingState } from '@/components/ui'
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
                      <DiscussionLink href={fbUrl} />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* 討論區 link for group (shown once at bottom), disabled rather than hidden when there's no fbUrl */}
        {isGroup && (
          <DiscussionLink href={fbUrl} className="self-end" />
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
      <ErrorState>
        <p>{error}</p>
        <a
          href="/"
          className={styles.loginLink}
        >
          回首頁登入
        </a>
      </ErrorState>
    )
  }

  const isEmpty = !replyList || replyList.data.length === 0

  return (
    <div>
      <p className={styles.description}>回顧每次練習的題目、作答與得分。</p>

      {isEmpty ? (
        <EmptyState>
          <p>
            {filters.hasActiveFilters ? '沒有符合篩選條件的答題紀錄' : '尚無答題紀錄'}
          </p>
          {!filters.hasActiveFilters && (
            <ButtonLink href="/adaptive">
              開始智慧練習
            </ButtonLink>
          )}
        </EmptyState>
      ) : (
        <>
          <MathJax dynamic>
            <div className={styles.cardList}>
              {replyList.data.map((item) => (
                <ReplyRow key={`${item.repliedAt}|${item.children[0]?.parentId ?? item.children[0]?.questionId}`} item={item} />
              ))}
            </div>
          </MathJax>

          <Pagination
            page={page}
            totalPages={replyList.paginate.totalPages}
            onChange={fetchPage}
            disabled={loading}
            className="mt-6"
          />
        </>
      )}
    </div>
  )
}
