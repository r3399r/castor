'use client'

import { useEffect, useMemo, useState } from 'react'
import { MathJax } from 'better-react-mathjax'
import { BookOpenText } from 'lucide-react'
import { apiDelete, apiFetch, apiPut, LIMIT } from '@/lib/api'
import Chip, { tagColors } from '@/components/Chip'
import DifficultyStars from '@/components/DifficultyStars'
import type { GetWrongQuestionResponse, Paginate, PutWrongQuestionNoteResponse, WrongQuestion } from '@/types/api'

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
    <article className="overflow-hidden rounded-lg border border-brown-700 bg-white/60">
      <div className="border-b border-[#E3D1C5] px-5 pt-3 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex shrink-0 items-center gap-2 font-bold text-blue-700">
              <BookOpenText size={20} strokeWidth={2.5} className="shrink-0 text-orange-700/70" />
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
          <DifficultyStars value={difficulty} />
        </div>
      </div>

      <div className="flex flex-col gap-4 px-5 py-7 lg:px-[40px]">
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
            <span className="inline-block rounded border border-brown-300 bg-white/60 px-2 py-0.5 font-semibold text-black-900">
              {question.answer}
            </span>
          </div>
        )}

        <div className="rounded-md border border-orange-700/30 bg-orange-700/10 px-5 py-4">
          <div className="flex flex-col gap-2 text-base text-black-700 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
            <div>
              最後答錯時間：
              <span className="font-medium text-black-900">{formatDate(item.lastWrongAt)}</span>
            </div>
            <div className="flex items-center gap-4">
              <div>
                得分：
                <span className="inline-block rounded border border-orange-700/30 bg-white/60 px-2 py-0.5 font-semibold text-orange-700">
                  {item.score}
                </span>
              </div>
              <div>
                答錯次數：
                <span className="inline-block rounded border border-orange-700/30 bg-white/60 px-2 py-0.5 font-semibold text-orange-700">
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
            className="w-full rounded-md border border-brown-300 bg-white/80 px-3 py-2 text-sm text-black-900 focus:border-blue-700 focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={handleSave}
            disabled={saving || !noteChanged}
            className="rounded-md bg-blue-700 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-[#1f3ea3] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? '儲存中…' : '儲存註記'}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-md border border-red-300 px-4 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? '移除中…' : '從錯題本移除'}
          </button>
        </div>
      </div>
    </article>
  )
}

export default function WrongClient() {
  const [list, setList] = useState<GetWrongQuestionResponse | null>(null)
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
      const data = await apiFetch<GetWrongQuestionResponse>('wrong-question', {
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
      setList(data)
      setPage(p)
    } catch {
      setError('無法載入錯題本，請確認已登入。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    apiFetch<Paginate<CategoryOption>>('category', { limit: ALL_ITEMS_LIMIT })
      .then((res) => setCategoryList(res.data))
      .catch(console.error)
  }, [])

  // See /reply's ReplyClient for why the resets below happen synchronously
  // in these handlers rather than in a useEffect reacting to the id change
  // -- doing it here keeps subjectId/examIds/tagIds mutually consistent by
  // the time the fetch effect further down runs, with no guard needed.
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
    await fetchPage(nextPage, selectedCategoryId, selectedSubjectId, selectedExamIds, selectedTagIds)
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
      <div className="rounded-[24px] border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <a href="/" className="mt-4 inline-block text-sm text-blue-700 underline hover:text-[#1f3ea3]">
          回首頁登入
        </a>
      </div>
    )
  }

  const isEmpty = !list || list.data.length === 0

  return (
    <div>
      <h1 className="mt-[60px] mb-2 text-3xl font-bold text-blue-700">錯題本</h1>
      <p className="mb-6 text-sm text-black-500">作答時未拿到滿分的題目會自動收錄在這裡，答對後也不會自動移除，你可以自己加註記或移除。</p>

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
            {hasActiveFilters ? '沒有符合篩選條件的錯題' : '目前沒有錯題，繼續保持！'}
          </p>
        </div>
      ) : (
        <>
          <MathJax dynamic>
            <div className="flex flex-col gap-[40px]">
              {list.data.map((item) => (
                <WrongCard key={item.id} item={item} onSaveNote={handleSaveNote} onDelete={handleDelete} />
              ))}
            </div>
          </MathJax>

          {list.paginate.totalPages > 1 && (
            <div className="mt-6 mb-[70px] flex items-center justify-center gap-3">
              <button
                onClick={() => fetchPage(page - 1, selectedCategoryId, selectedSubjectId, selectedExamIds, selectedTagIds)}
                disabled={page === 1 || loading}
                className="rounded-md border border-brown-300 px-4 py-2 text-sm disabled:opacity-40"
              >
                ← 上一頁
              </button>
              <span className="text-sm text-black-500">
                第 {page} / {list.paginate.totalPages} 頁
              </span>
              <button
                onClick={() => fetchPage(page + 1, selectedCategoryId, selectedSubjectId, selectedExamIds, selectedTagIds)}
                disabled={page === list.paginate.totalPages || loading}
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
