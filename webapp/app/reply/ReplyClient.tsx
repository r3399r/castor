'use client'

import { useEffect, useMemo, useState } from 'react'
import { MathJax } from 'better-react-mathjax'
import { BookOpenText } from 'lucide-react'
import { apiFetch, LIMIT } from '@/lib/api'
import Chip, { tagColors } from '@/components/Chip'
import DifficultyStars from '@/components/DifficultyStars'
import type { GetReplyResponse, Paginate, ReplyGroup } from '@/types/api'

// High enough to fetch every category/subject in one page -- there's no
// realistic dataset near this size yet (mirrors /adaptive's constant).
const ALL_ITEMS_LIMIT = 1000

type CategoryOption = { id: number; name: string }
type SubjectOption = { id: number; name: string; sortOrder: number }
type NamedOption = { id: number; name: string }
type SubjectDetail = { id: number; name: string; exams: NamedOption[]; tags: NamedOption[] }
type FilterDimensionWithOptions = {
  id: number
  name: string
  sortOrder: number
  options: { id: number; name: string; parentId: number | null; subjectIds: number[] }[]
}

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
    <article className="overflow-hidden rounded-lg border border-brown-700 bg-white/60">
      {/* Header */}
      <div className="border-b border-[#E3D1C5] px-5 pt-3 pb-2">
        <div className="flex items-center justify-between gap-3 sm:hidden">
          <span className="flex items-center gap-2 font-bold text-blue-700">
            <BookOpenText size={20} strokeWidth={2.5} className="shrink-0 text-orange-700/70" />
            {item.subject.name}
          </span>
          <DifficultyStars value={difficulty} />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2 sm:hidden">
          <MetaChips />
        </div>
        <div className="hidden sm:flex sm:items-start sm:justify-between sm:gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex shrink-0 items-center gap-2 font-bold text-blue-700">
              <BookOpenText size={20} strokeWidth={2.5} className="shrink-0 text-orange-700/70" />
              {item.subject.name}
            </span>
            <div className="ml-2 flex flex-wrap gap-2">
              <MetaChips />
            </div>
          </div>
          <DifficultyStars value={difficulty} />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-4 px-5 py-7 lg:px-[40px]">
        {/* Parent / standalone question content */}
        {question.content && (
          <div
            dangerouslySetInnerHTML={{ __html: question.content }}
            className="prose max-w-none text-[18px] font-medium text-black-800 [&>*:last-child]:mb-0"
          />
        )}

        {/* Sub-questions (for 題組) or single answer block */}
        <div className={`flex flex-col ${isGroup ? 'gap-6' : 'gap-0'}`}>
          {item.children.map((child, idx) => {
            const correct = child.score > 0
            const childQ = isGroup ? child.question : null
            return (
              <div key={child.id} className={isGroup ? 'border-t border-brown-300 pt-5' : ''}>
                {childQ?.content && (
                  <div
                    dangerouslySetInnerHTML={{ __html: childQ.content }}
                    className="prose prose-sm mb-4 max-w-none text-black-800 [&>*:last-child]:mb-0"
                  />
                )}
                <div
                  className={`rounded-md border px-5 py-4 ${
                    correct ? 'border-green-700/30 bg-green-700/10' : 'border-orange-700/30 bg-orange-700/10'
                  }`}
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
                          <span className="inline-block rounded border border-brown-300 bg-white/60 px-2 py-0.5 font-semibold text-black-900">
                            {child.repliedAnswer ?? '—'}
                          </span>
                        </div>
                        <div>
                          得分：
                          <span
                            className={`inline-block rounded border bg-white/60 px-2 py-0.5 font-semibold ${
                              correct
                                ? 'border-green-700/30 text-green-700'
                                : 'border-orange-700/30 text-orange-700'
                            }`}
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
                        className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-brown-900 px-3 py-1.5 text-sm font-medium text-brown-900 transition sm:w-auto sm:justify-start ${
                          fbUrl ? 'hover:bg-brown-900/10' : 'cursor-not-allowed opacity-40'
                        }`}
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
            className={`inline-flex w-auto items-center gap-1.5 self-end rounded-md border border-brown-900 px-3 py-1.5 text-sm font-medium text-brown-900 transition ${
              fbUrl ? 'hover:bg-brown-900/10' : 'cursor-not-allowed opacity-40'
            }`}
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

export default function ReplyClient() {
  const [replyList, setReplyList] = useState<GetReplyResponse | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [selectedFilterOptionByDim, setSelectedFilterOptionByDim] = useState<Record<number, number>>({})

  const [categoryList, setCategoryList] = useState<CategoryOption[]>([])
  const [subjectList, setSubjectList] = useState<SubjectOption[]>([])
  const [filterDimensions, setFilterDimensions] = useState<FilterDimensionWithOptions[]>([])
  const [examList, setExamList] = useState<NamedOption[]>([])
  const [tagList, setTagList] = useState<NamedOption[]>([])

  const hasActiveFilters =
    !!selectedCategoryId || !!selectedSubjectId || selectedExamIds.length > 0 || selectedTagIds.length > 0

  const fetchPage = async (
    p: number,
    categoryId: string,
    subjectId: string,
    examIds: string[],
    tagIds: string[],
  ) => {
    setLoading(true)
    try {
      const data = await apiFetch<GetReplyResponse>('reply', {
        offset: p > 1 ? (p - 1) * LIMIT : undefined,
        limit: LIMIT,
        // subjectId already implies its category, so categoryId is only sent
        // when no subject is picked yet (browsing "every subject in this
        // category") -- sending both would just make the backend resolve
        // the same subject set twice for no extra filtering effect.
        categoryId: subjectId ? undefined : categoryId || undefined,
        subjectId: subjectId || undefined,
        examIds: examIds.length ? examIds.join(',') : undefined,
        tagIds: tagIds.length ? tagIds.join(',') : undefined,
      })
      setReplyList(data)
      setPage(p)
    } catch {
      setError('無法載入答題紀錄，請確認已登入。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    apiFetch<Paginate<CategoryOption>>('category', { limit: ALL_ITEMS_LIMIT })
      .then((res) => setCategoryList(res.data))
      .catch(console.error)
  }, [])

  // Category/subject selection resets their dependent filters synchronously,
  // in the same handler call rather than in a useEffect reacting to the id
  // change -- React batches all of these setState calls into one commit, so
  // by the time the fetch effect below runs, subjectId/examIds/tagIds are
  // already mutually consistent. (An effect-based reset would land one
  // commit later, letting the fetch effect fire once in between with a new
  // subjectId but the previous subject's stale exam/tag ids.)
  const selectCategory = (id: string) => {
    const next = selectedCategoryId === id ? '' : id
    setSelectedCategoryId(next)
    setSelectedSubjectId('')
    setSelectedFilterOptionByDim({})
    setSelectedExamIds([])
    setSelectedTagIds([])
    setExamList([])
    setTagList([])
    if (!next) {
      setSubjectList([])
      setFilterDimensions([])
      return
    }
    apiFetch<{ subjects: SubjectOption[]; filterDimensions: FilterDimensionWithOptions[] }>(`category/${next}/subject`)
      .then(({ subjects, filterDimensions }) => {
        setSubjectList(subjects)
        setFilterDimensions(filterDimensions)
      })
      .catch(console.error)
  }

  const selectSubject = (id: string) => {
    const next = selectedSubjectId === id ? '' : id
    setSelectedSubjectId(next)
    setSelectedExamIds([])
    setSelectedTagIds([])
    if (!next) {
      setExamList([])
      setTagList([])
      return
    }
    apiFetch<SubjectDetail>(`subject/${next}`)
      .then((detail) => {
        setExamList(detail.exams)
        setTagList(detail.tags)
      })
      .catch(console.error)
  }

  const { filteredSubjectList, visibleOptionsByDim } = useMemo(() => {
    const sortedDims = [...filterDimensions].sort((a, b) => a.sortOrder - b.sortOrder)
    const visibleOptionsByDim: Record<number, FilterDimensionWithOptions['options']> = {}

    // cascade display: track which parentIds are valid for the next dimension
    let validParentIds: Set<number | null> = new Set([null])
    for (const dim of sortedDims) {
      visibleOptionsByDim[dim.id] = dim.options.filter((o) => validParentIds.has(o.parentId))
      const selectedOptId = selectedFilterOptionByDim[dim.id]
      validParentIds = selectedOptId !== undefined
        ? new Set([selectedOptId])
        : new Set(visibleOptionsByDim[dim.id].map((o) => o.id))
    }

    // filter subjects: intersect selected options' subjectIds across all dims
    let currentIds = new Set(subjectList.map((s) => s.id))
    for (const dim of sortedDims) {
      const selectedOptId = selectedFilterOptionByDim[dim.id]
      if (selectedOptId !== undefined) {
        const opt = dim.options.find((o) => o.id === selectedOptId)
        if (opt) currentIds = new Set(opt.subjectIds.filter((id) => currentIds.has(id)))
      }
    }

    return { filteredSubjectList: subjectList.filter((s) => currentIds.has(s.id)), visibleOptionsByDim }
  }, [subjectList, filterDimensions, selectedFilterOptionByDim])

  // A filter-dimension pick can narrow filteredSubjectList out from under the
  // currently selected subject -- when that happens, clear it and its exam/tag
  // filters together in this one effect call, so this is the only reset that's
  // still effect-driven (there's no click handler to put it in) and it stays
  // just as atomic as the handlers above.
  useEffect(() => {
    if (!selectedSubjectId) return
    if (filteredSubjectList.some((s) => String(s.id) === selectedSubjectId)) return
    setSelectedSubjectId('')
    setSelectedExamIds([])
    setSelectedTagIds([])
    setExamList([])
    setTagList([])
  }, [filteredSubjectList])

  useEffect(() => {
    setSelectedFilterOptionByDim((prev) => {
      const next = { ...prev }
      let changed = false
      for (const [dimId, optId] of Object.entries(prev)) {
        const visible = visibleOptionsByDim[Number(dimId)]
        if (visible && !visible.some((o) => o.id === optId)) {
          delete next[Number(dimId)]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [visibleOptionsByDim])

  // examIds/tagIds are always reset together with subjectId (see the
  // handlers above and the narrowing effect), so by the time this effect's
  // dependencies change, they're already mutually consistent -- no guard
  // needed. Keying on the joined id strings (not the arrays themselves)
  // avoids a spurious refire when a reset creates a new but equally-empty
  // array.
  const examIdsKey = selectedExamIds.join(',')
  const tagIdsKey = selectedTagIds.join(',')

  useEffect(() => {
    fetchPage(1, selectedCategoryId, selectedSubjectId, selectedExamIds, selectedTagIds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoryId, selectedSubjectId, examIdsKey, tagIdsKey])

  const clearFilters = () => {
    setSelectedCategoryId('')
    setSelectedSubjectId('')
    setSelectedFilterOptionByDim({})
    setSelectedExamIds([])
    setSelectedTagIds([])
    setSubjectList([])
    setFilterDimensions([])
    setExamList([])
    setTagList([])
  }

  if (loading && !replyList) {
    return (
      <div className="flex h-48 items-center justify-center">
        <span className="text-sm text-black-500">載入中…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-[24px] border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <a
          href="/"
          className="mt-4 inline-block text-sm text-blue-700 underline hover:text-[#1f3ea3]"
        >
          回首頁登入
        </a>
      </div>
    )
  }

  const isEmpty = !replyList || replyList.data.length === 0

  return (
    <div>
      <h1 className="mt-[60px] mb-2 text-3xl font-bold text-blue-700">作答記錄</h1>
      <p className="mb-6 text-sm text-black-500">回顧每次練習的題目、作答與得分。</p>

      <div className="mb-10 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-black-700">篩選條件</span>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              disabled={loading}
              className="flex items-center gap-1 rounded-md border border-brown-300 px-2.5 py-1 text-sm text-black-500 transition hover:bg-beige-200 disabled:opacity-50"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M11 3L3 11M3 3L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              清空篩選
            </button>
          )}
        </div>

        {/* 類別 */}
        {categoryList.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {categoryList.map((c) => (
              <button
                key={c.id}
                onClick={() => selectCategory(String(c.id))}
                disabled={loading}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  selectedCategoryId === String(c.id)
                    ? 'border-2 border-blue-700 bg-blue-700/10 text-blue-700'
                    : 'border border-brown-300 bg-beige-200/80 text-black-900 hover:border-brown-700'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* 篩選維度（依類別而定）*/}
        {selectedCategoryId && filterDimensions.length > 0 && (
          <div className="divide-y divide-brown-300 rounded-lg border border-brown-700 bg-white/60">
            {filterDimensions.map((dim) => (
              <div key={dim.id} className="px-4 py-3">
                <span className="mb-2 block text-xs font-bold text-black-700">{dim.name}</span>
                <div className="flex flex-wrap gap-2">
                  {(visibleOptionsByDim[dim.id] ?? dim.options).map((opt) => {
                    const checked = selectedFilterOptionByDim[dim.id] === opt.id
                    return (
                      <button
                        key={opt.id}
                        onClick={() =>
                          setSelectedFilterOptionByDim((prev) =>
                            checked
                              ? (({ [dim.id]: _, ...rest }) => rest)(prev)
                              : { ...prev, [dim.id]: opt.id },
                          )
                        }
                        disabled={loading}
                        className={`rounded-lg px-3 py-1 text-sm font-medium transition ${
                          checked
                            ? 'border-2 border-teal-700 bg-teal-700/10 text-teal-700'
                            : 'border border-brown-300 bg-beige-200/80 text-black-900 hover:border-brown-700'
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {opt.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 科目 */}
        {selectedCategoryId && filteredSubjectList.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {filteredSubjectList.map((s) => (
              <button
                key={s.id}
                onClick={() => selectSubject(String(s.id))}
                disabled={loading}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  selectedSubjectId === String(s.id)
                    ? 'border-2 border-green-700 bg-green-700/10 text-green-700'
                    : 'border border-brown-300 bg-beige-200/80 text-black-900 hover:border-brown-700'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* 試卷／標籤 */}
        {selectedSubjectId && (examList.length > 0 || tagList.length > 0) && (
          <div className="divide-y divide-brown-300 rounded-lg border border-brown-700 bg-white/60">
            {examList.length > 0 && (
              <div className="px-4 py-3">
                <span className="mb-2 block text-xs font-bold text-black-700">試卷（可複選）</span>
                <div className="flex flex-wrap gap-2">
                  {examList.map((e) => {
                    const checked = selectedExamIds.includes(String(e.id))
                    return (
                      <button
                        key={e.id}
                        onClick={() =>
                          setSelectedExamIds((prev) =>
                            checked ? prev.filter((x) => x !== String(e.id)) : [...prev, String(e.id)],
                          )
                        }
                        disabled={loading}
                        className={`rounded-lg px-3 py-1 text-sm font-medium transition ${
                          checked
                            ? 'border-2 border-purple-700 bg-purple-700/10 text-purple-700'
                            : 'border border-brown-300 bg-beige-200/80 text-black-900 hover:border-brown-700'
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {e.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {tagList.length > 0 && (
              <div className="px-4 py-3">
                <span className="mb-2 block text-xs font-bold text-black-700">標籤（可複選）</span>
                <div className="flex flex-wrap gap-2">
                  {tagList.map((t) => {
                    const checked = selectedTagIds.includes(String(t.id))
                    return (
                      <button
                        key={t.id}
                        onClick={() =>
                          setSelectedTagIds((prev) =>
                            checked ? prev.filter((x) => x !== String(t.id)) : [...prev, String(t.id)],
                          )
                        }
                        disabled={loading}
                        className={`rounded-lg px-3 py-1 text-sm font-medium transition ${
                          checked
                            ? 'border-2 border-blue-700 bg-blue-700/10 text-blue-700'
                            : 'border border-brown-300 bg-beige-200/80 text-black-900 hover:border-brown-700'
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {t.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {isEmpty ? (
        <div className="rounded-[24px] border border-brown-300 bg-white p-8 text-center">
          <p className="text-sm text-black-500">
            {hasActiveFilters ? '沒有符合篩選條件的答題紀錄' : '尚無答題紀錄'}
          </p>
          {!hasActiveFilters && (
            <a
              href="/adaptive"
              className="mt-4 inline-block rounded-md bg-blue-700 px-6 py-2.5 text-sm font-bold text-white hover:bg-[#1f3ea3]"
            >
              開始智慧練習
            </a>
          )}
        </div>
      ) : (
        <>
          <MathJax dynamic>
            <div className="flex flex-col gap-[40px]">
              {replyList.data.map((item) => (
                <ReplyRow key={`${item.repliedAt}|${item.children[0]?.parentId ?? item.children[0]?.questionId}`} item={item} />
              ))}
            </div>
          </MathJax>

          {replyList.paginate.totalPages > 1 && (
            <div className="mt-6 mb-[70px] flex items-center justify-center gap-3">
              <button
                onClick={() => fetchPage(page - 1, selectedCategoryId, selectedSubjectId, selectedExamIds, selectedTagIds)}
                disabled={page === 1 || loading}
                className="rounded-md border border-brown-300 px-4 py-2 text-sm disabled:opacity-40"
              >
                ← 上一頁
              </button>
              <span className="text-sm text-black-500">
                第 {page} / {replyList.paginate.totalPages} 頁
              </span>
              <button
                onClick={() => fetchPage(page + 1, selectedCategoryId, selectedSubjectId, selectedExamIds, selectedTagIds)}
                disabled={page === replyList.paginate.totalPages || loading}
                className="rounded-md border border-brown-300 px-4 py-2 text-sm disabled:opacity-40"
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
