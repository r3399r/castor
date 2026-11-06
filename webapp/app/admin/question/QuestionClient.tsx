'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { apiDelete, apiFetch, apiPut, LIMIT } from '@/lib/api'
import MathJaxArea from '@/components/MathJaxArea'
import MultiSelectField from '@/components/MultiSelectField'
import Pagination from '@/components/Pagination'
import { ErrorState, LoadingState, Modal, PageHeader, TableFrame } from '@/components/ui'
import SortableTh, { type SortDirection } from '@/components/SortableTh'
import { readableAnswer } from '@/lib/answerDisplay'
import type { Paginate, Question } from '@/types/api'
import { MathJax } from 'better-react-mathjax'

type QuestionRow = {
  id: number
  subjectId: number
  subject: string
  // The subject's categories. An array because subject-to-category is
  // many-to-many, and empty when the subject is filed under none.
  categories: string[]
  type: string
  content: string | null
  options: string | null
  answer: string | null
  difficulty: number
  isGroup: boolean
  enabled: boolean
  childCount: number
}

type ChildQuestion = {
  id: number
  type: string
  sortOrder: number | null
  content: string | null
  options: string | null
  answer: string | null
  difficulty: number
  adjustedDifficulty: number
}

/**
 * GET /api/question/:id -- the question row plus its links.
 *
 * Deliberately spelled out rather than `QuestionRow & {...}`: the detail
 * endpoint returns the raw row, and has no subject name, categories or
 * childCount, all of which the list query joins in. Declaring it as an
 * extension of the row would type three fields that never arrive.
 */
type QuestionDetail = {
  id: number
  subjectId: number
  type: string
  content: string | null
  options: string | null
  answer: string | null
  // The value the question was seeded with, and still the prior that
  // reply.ts weights into adjustedDifficulty on every answer -- editable
  // below, but never the number shown to a reader.
  difficulty: number
  // What every surface displays and what adaptive selection matches
  // against: difficulty as moved by how people have actually scored.
  adjustedDifficulty: number
  isGroup: boolean
  enabled: boolean
  examId: number | null
  tagIds: number[]
  conceptIds: number[]
  // Only ever populated for a 題組; [] for a standalone question.
  children: ChildQuestion[]
}

// adjustedDifficulty is a double that drifts with each answer, so it is
// shown to one decimal; anything finer is noise to a reader.
const showDifficulty = (value: number) => value.toFixed(1)

type SubjectDetail = {
  id: number
  name: string
  exams: { id: number; name: string }[]
  tags: { id: number; name: string }[]
  conceptGroups: { id: number; name: string; concepts: { id: number; name: string }[] }[]
}

type SortColumn = 'id' | 'subject' | 'type' | 'difficulty'

type Option = { id: number; name: string }

/**
 * The list filters, held as strings because that is what a `<select>`
 * gives back; '' means "not filtering on this dimension".
 */
type Filters = {
  categoryId: string
  subjectId: string
  examId: string
  conceptId: string
  tagId: string
}

const NO_FILTERS: Filters = {
  categoryId: '',
  subjectId: '',
  examId: '',
  conceptId: '',
  tagId: '',
}

const hasFilter = (f: Filters) => Object.values(f).some((v) => v !== '')

/** The filters as query params, dropping the ones left unset. */
const filterParams = (f: Filters) => ({
  categoryId: f.categoryId || undefined,
  subjectId: f.subjectId || undefined,
  examId: f.examId || undefined,
  conceptId: f.conceptId || undefined,
  tagId: f.tagId || undefined,
})

/**
 * Narrowing one dimension drops the narrower choices it may have
 * invalidated: exams, concepts and tags all belong to a single subject,
 * and the subject list itself comes from the category, so keeping a
 * stale id would filter by something no longer on offer -- an empty
 * table with no visible reason for it.
 */
const applyFilter = (current: Filters, key: keyof Filters, value: string): Filters => {
  if (key === 'categoryId') return { ...NO_FILTERS, categoryId: value }
  if (key === 'subjectId')
    return { ...NO_FILTERS, categoryId: current.categoryId, subjectId: value }
  return { ...current, [key]: value }
}

/** One labelled dropdown in the filter bar. */
function FilterSelect({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder: string
  children: ReactNode
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-black-500">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-brown-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-700 disabled:cursor-not-allowed disabled:bg-beige-100 disabled:text-black-300"
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
    </label>
  )
}

const QUESTION_TYPES = ['GROUP', 'SINGLE', 'MULTIPLE', 'TRUE_FALSE', 'FILL']

// The filter dropdowns want every category and subject in one go, not a
// page of them -- both lists are small enough that paging them would only
// hide options. High enough to be effectively "all", and the backend caps
// it at MAX_LIMIT anyway.
const ALL_OPTIONS_LIMIT = 1000

const contentSnippet = (content: string | null) => {
  if (!content) return '-'
  const stripped = content.replace(/<[^>]+>/g, '')
  return stripped.length > 40 ? `${stripped.slice(0, 40)}…` : stripped
}

/** One label/value line in the preview's metadata block. */
function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-16 shrink-0 text-black-500">{label}</span>
      <span className="min-w-0 text-black-900">{children}</span>
    </div>
  )
}

/** Rendered question content, or a placeholder when there is none. */
function Rendered({ html }: { html: string | null }) {
  if (!html) return <p className="text-sm text-black-200">（無內容）</p>
  return (
    <div
      dangerouslySetInnerHTML={{ __html: html }}
      className="prose prose-sm max-w-none text-black-900"
    />
  )
}

/**
 * Read-only preview of one question, as close to what a user is shown as
 * this page can get: the content typeset by MathJax rather than printed
 * as raw $...$, and the ids on the row resolved to the names they stand
 * for.
 *
 * It takes the already-fetched detail and subject rather than loading
 * them itself, because the row's 編輯 action needs exactly the same two
 * requests -- see loadDetail.
 */
function PreviewModal({
  row,
  detail,
  subject,
  onClose,
}: {
  row: QuestionRow
  detail: QuestionDetail
  subject: SubjectDetail
  onClose: () => void
}) {
  const conceptNames = subject.conceptGroups.flatMap((group) =>
    group.concepts
      .filter((concept) => detail.conceptIds.includes(concept.id))
      .map((concept) => (group.name === concept.name ? concept.name : `${group.name} - ${concept.name}`))
  )
  const tagNames = subject.tags
    .filter((tag) => detail.tagIds.includes(tag.id))
    .map((tag) => tag.name)
  const examName = subject.exams.find((exam) => exam.id === detail.examId)?.name ?? null

  // question.type is a free varchar in the database, so this page carries
  // it as a string; readableAnswer only reacts to the four it knows and
  // returns null for anything else, which falls through to the raw value.
  const answerOf = (q: { type: string; answer: string | null; options: string | null }) =>
    readableAnswer(q.type as Question['type'], q.answer, q.options) ?? q.answer ?? '—'

  return (
    <Modal title={`題目 #${row.id}`} onClose={onClose} className="sp-modal--wide">
      {/*
        One MathJaxArea around the whole body rather than one per block:
        typesetting runs from this component's own render, and every
        formula here arrives in that same render.
      */}
      <MathJaxArea className="flex flex-col gap-5">
        <div className="grid gap-2 rounded-lg border border-brown-300 bg-beige-100 p-4 sm:grid-cols-2">
          <Meta label="分類">{row.categories.length > 0 ? row.categories.join('、') : '—'}</Meta>
          <Meta label="科目">{row.subject}</Meta>
          <Meta label="題型">
            {detail.type}
            {detail.children.length > 0 && `（${detail.children.length} 子題）`}
          </Meta>
          <Meta label="難度">
            {showDifficulty(detail.adjustedDifficulty)}
            <span className="ml-2 text-black-500">（初始 {detail.difficulty}）</span>
          </Meta>
          <Meta label="試卷">{examName ?? '—'}</Meta>
          <Meta label="狀態">{row.enabled ? '已啟用' : '停用中'}</Meta>
          <Meta label="觀念">{conceptNames.length > 0 ? conceptNames.join('、') : '—'}</Meta>
          <Meta label="標籤">{tagNames.length > 0 ? tagNames.join('、') : '—'}</Meta>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-black-700">
            {detail.children.length > 0 ? '題組題幹' : '題目'}
          </p>
          <div className="rounded-lg border border-brown-300 p-4">
            <Rendered html={detail.content} />
            {detail.children.length === 0 && (
              <p className="mt-3 border-t border-brown-300/60 pt-3 text-sm text-black-700">
                答案：<span className="font-medium text-black-900">{answerOf(detail)}</span>
              </p>
            )}
          </div>
        </div>

        {detail.children.map((child, i) => (
          <div key={child.id}>
            <p className="mb-2 text-sm font-medium text-black-700">第 {i + 1} 題</p>
            <div className="rounded-lg border border-brown-300 p-4">
              <Rendered html={child.content} />
              <p className="mt-3 border-t border-brown-300/60 pt-3 text-sm text-black-700">
                答案：<span className="font-medium text-black-900">{answerOf(child)}</span>
                <span className="ml-4 text-black-500">
                  難度 {showDifficulty(child.adjustedDifficulty)}
                </span>
              </p>
            </div>
          </div>
        ))}
      </MathJaxArea>
    </Modal>
  )
}

export default function QuestionClient() {
  const [questions, setQuestions] = useState<QuestionRow[] | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sortColumn, setSortColumn] = useState<SortColumn>('id')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [categoryList, setCategoryList] = useState<Option[]>([])
  // Every subject, so the 科目 select works without first picking a
  // category; replaced by the category's own list once one is picked.
  const [allSubjects, setAllSubjects] = useState<Option[]>([])
  const [categorySubjects, setCategorySubjects] = useState<Option[] | null>(null)
  // The chosen subject's exams, concept groups and tags -- those three
  // dimensions only exist within a subject, so the selects stay disabled
  // until one is chosen.
  const [filterSubject, setFilterSubject] = useState<SubjectDetail | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [loadingEditId, setLoadingEditId] = useState<number | null>(null)
  const [editSubject, setEditSubject] = useState<SubjectDetail | null>(null)
  const [editType, setEditType] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editOptions, setEditOptions] = useState('')
  const [editAnswer, setEditAnswer] = useState('')
  const [editDifficulty, setEditDifficulty] = useState('')
  const [editExamId, setEditExamId] = useState('')
  const [editTagIds, setEditTagIds] = useState<string[]>([])
  const [editConceptIds, setEditConceptIds] = useState<string[]>([])
  const [savingId, setSavingId] = useState<number | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [togglingId, setTogglingId] = useState<number | null>(null)

  const [preview, setPreview] = useState<{
    row: QuestionRow
    detail: QuestionDetail
    subject: SubjectDetail
  } | null>(null)
  const [loadingPreviewId, setLoadingPreviewId] = useState<number | null>(null)

  const load = async (
    targetPage: number,
    sort: SortColumn,
    order: SortDirection,
    activeFilters: Filters = filters
  ) => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<Paginate<QuestionRow>>('question', {
        limit: LIMIT,
        offset: (targetPage - 1) * LIMIT,
        sort,
        order,
        ...filterParams(activeFilters),
      })
      setQuestions(res.data)
      setTotalPages(res.paginate.totalPages)
      setTotalQuestions(res.paginate.total)
      setPage(targetPage)
    } catch {
      setError('無法載入題目列表。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(1, sortColumn, sortDirection)
    // The filter bar's own option lists. A failure here leaves the
    // selects empty rather than blocking the table, which is still
    // usable unfiltered.
    apiFetch<Paginate<Option>>('category', { limit: ALL_OPTIONS_LIMIT })
      .then((res) => setCategoryList(res.data))
      .catch(() => setCategoryList([]))
    apiFetch<Paginate<Option>>('subject', { limit: ALL_OPTIONS_LIMIT })
      .then((res) => setAllSubjects(res.data))
      .catch(() => setAllSubjects([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!filters.categoryId) {
      setCategorySubjects(null)
      return
    }
    apiFetch<{ subjects: Option[] }>(`category/${filters.categoryId}/subject`)
      .then((res) => setCategorySubjects(res.subjects))
      .catch(() => setCategorySubjects([]))
  }, [filters.categoryId])

  useEffect(() => {
    if (!filters.subjectId) {
      setFilterSubject(null)
      return
    }
    apiFetch<SubjectDetail>(`subject/${filters.subjectId}`)
      .then(setFilterSubject)
      .catch(() => setFilterSubject(null))
  }, [filters.subjectId])

  // Changing a filter always returns to page 1: the row that was on page
  // 3 of the unfiltered list is rarely on page 3 of the filtered one.
  const changeFilter = (key: keyof Filters, value: string) => {
    const next = applyFilter(filters, key, value)
    setFilters(next)
    load(1, sortColumn, sortDirection, next)
  }

  const clearFilters = () => {
    setFilters(NO_FILTERS)
    load(1, sortColumn, sortDirection, NO_FILTERS)
  }

  const subjectOptions = categorySubjects ?? allSubjects

  // Both actions need the same pair: the question's own links (ids) and
  // the subject the names for those ids live on.
  const loadDetail = (row: QuestionRow) =>
    Promise.all([
      apiFetch<QuestionDetail>(`question/${row.id}`),
      apiFetch<SubjectDetail>(`subject/${row.subjectId}`),
    ])

  const openPreview = async (row: QuestionRow) => {
    setLoadingPreviewId(row.id)
    try {
      const [detail, subject] = await loadDetail(row)
      setPreview({ row, detail, subject })
    } catch {
      alert('無法載入題目資料，請稍後再試。')
    } finally {
      setLoadingPreviewId(null)
    }
  }

  const startEdit = async (row: QuestionRow) => {
    setLoadingEditId(row.id)
    setEditError(null)
    try {
      const [detail, subjectDetail] = await loadDetail(row)
      setEditingId(row.id)
      setEditSubject(subjectDetail)
      setEditType(detail.type)
      setEditContent(detail.content ?? '')
      setEditOptions(detail.options ?? '')
      setEditAnswer(detail.answer ?? '')
      setEditDifficulty(String(detail.difficulty))
      setEditExamId(detail.examId ? String(detail.examId) : '')
      setEditTagIds(detail.tagIds.map(String))
      setEditConceptIds(detail.conceptIds.map(String))
    } catch {
      alert('無法載入題目資料，請稍後再試。')
    } finally {
      setLoadingEditId(null)
    }
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditSubject(null)
    setEditError(null)
  }

  const handleSave = async (row: QuestionRow) => {
    if (!editExamId || editConceptIds.length === 0) return

    setSavingId(row.id)
    setEditError(null)
    try {
      await apiPut(`question/${row.id}`, {
        type: editType,
        content: editContent || undefined,
        options: editOptions || undefined,
        answer: editAnswer || undefined,
        difficulty: Number(editDifficulty),
        examId: Number(editExamId),
      })
      await apiPut(`question/${row.id}/tag`, { tagIds: editTagIds.map(Number) })
      await apiPut(`question/${row.id}/concept`, {
        conceptIds: editConceptIds.map(Number),
      })
      setEditingId(null)
      setEditSubject(null)
      await load(page, sortColumn, sortDirection)
    } catch {
      setEditError('更新失敗，請確認欄位是否正確。')
    } finally {
      setSavingId(null)
    }
  }

  const handleToggleEnabled = async (row: QuestionRow) => {
    const next = !row.enabled
    // Both directions are visible to users, so both ask first.
    const question = next
      ? '確定這題沒問題，要開放給使用者練習嗎？'
      : '確定要停用這個題目嗎？停用後使用者就不會再練習到它。'
    if (!confirm(question)) return

    setTogglingId(row.id)
    // Optimistic: the list is re-fetched on failure anyway, and waiting a
    // round trip to tick a checkbox makes reviewing a page of questions
    // feel broken.
    setQuestions((rows) =>
      (rows ?? []).map((r) => (r.id === row.id ? { ...r, enabled: next } : r))
    )
    try {
      await apiPut(`question/${row.id}/enabled`, { enabled: next })
    } catch {
      alert(next ? '啟用失敗，請稍後再試。' : '停用失敗，請稍後再試。')
      await load(page, sortColumn, sortDirection)
    } finally {
      setTogglingId(null)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('確定要刪除這個題目嗎？若為題組，子題也會一併刪除。')) return

    setDeletingId(id)
    try {
      await apiDelete(`question/${id}`)
      await load(page, sortColumn, sortDirection)
    } catch {
      alert('刪除失敗，請稍後再試。')
    } finally {
      setDeletingId(null)
    }
  }

  const handleSort = (column: SortColumn) => {
    const direction =
      column === sortColumn ? (sortDirection === 'asc' ? 'desc' : 'asc') : 'asc'
    setSortColumn(column)
    setSortDirection(direction)
    load(1, column, direction)
  }

  if (loading && questions === null) {
    return <LoadingState />
  }

  if (error) {
    return <ErrorState>{error}</ErrorState>
  }

  return (
    <div className="pb-page-bottom">
      <PageHeader title="題目管理" />
      <p className="mb-6 text-sm text-black-500">
        題目透過「新增題目」流程建立，此頁面僅供檢視、編輯與刪除。新建立的題目預設為停用，
        按下綠色的「啟用」後使用者才會練習到該題；顯示「停用」的題目則代表目前已啟用。
      </p>
      <p className="mb-6 text-sm text-black-500">
        要新增題目，請前往{' '}
        <a
          href="/admin/subject/"
          className="font-medium text-blue-700 underline transition hover:text-spirit-forest"
        >
          科目管理
        </a>
        ，在目標科目那一列按下「新增題目」。
      </p>

      <div className="mt-4 rounded-lg border border-brown-300 bg-beige-50 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <FilterSelect
            label="分類"
            value={filters.categoryId}
            onChange={(v) => changeFilter('categoryId', v)}
            placeholder="全部分類"
          >
            {categoryList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="科目"
            value={filters.subjectId}
            onChange={(v) => changeFilter('subjectId', v)}
            placeholder="全部科目"
          >
            {subjectOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="考試"
            value={filters.examId}
            onChange={(v) => changeFilter('examId', v)}
            disabled={!filterSubject}
            placeholder={filterSubject ? '全部考試' : '請先選科目'}
          >
            {(filterSubject?.exams ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="概念"
            value={filters.conceptId}
            onChange={(v) => changeFilter('conceptId', v)}
            disabled={!filterSubject}
            placeholder={filterSubject ? '全部概念' : '請先選科目'}
          >
            {/* Grouped, because a concept's name only makes sense under
                its group ("切線" belongs to 微分, not 三角). */}
            {(filterSubject?.conceptGroups ?? []).map((g) => (
              <optgroup key={g.id} label={g.name}>
                {g.concepts.map((concept) => (
                  <option key={concept.id} value={concept.id}>
                    {concept.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </FilterSelect>
          <FilterSelect
            label="標籤"
            value={filters.tagId}
            onChange={(v) => changeFilter('tagId', v)}
            disabled={!filterSubject}
            placeholder={filterSubject ? '全部標籤' : '請先選科目'}
          >
            {(filterSubject?.tags ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </FilterSelect>
        </div>
        {hasFilter(filters) && (
          <div className="mt-3 flex items-center gap-3 text-sm text-black-500">
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-md border border-brown-300 bg-white px-3 py-1.5 font-medium text-black-700 transition hover:border-blue-700 hover:text-blue-700"
            >
              清除篩選
            </button>
            <span>共 {totalQuestions} 題符合條件</span>
          </div>
        )}
      </div>

      <TableFrame className="mt-4">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-brown-300/60 text-xs font-medium text-black-700">
              <SortableTh label="ID" column="id" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              {/* Not sortable: it comes from the subject's category links
                  rather than a column of the question query, and a subject
                  can carry more than one. */}
              <th className="px-4 py-3">分類</th>
              <SortableTh label="科目" column="subject" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <th className="px-4 py-3">內容預覽</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {(questions ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-black-300">
                  {hasFilter(filters) ? '沒有符合篩選條件的題目' : '尚無題目'}
                </td>
              </tr>
            )}
            {(questions ?? []).map((row) => {
              const isEditing = editingId === row.id
              return (
                <tr key={row.id} className="border-b border-brown-300/30 last:border-0">
                  {isEditing && editSubject ? (
                    <td colSpan={5} className="px-4 py-4">
                      <div className="space-y-3 rounded-lg border border-brown-300 bg-white p-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="flex flex-col gap-1">
                            <label className="text-sm font-medium text-black-700">題型</label>
                            {row.childCount > 0 ? (
                              <span className="rounded-md border border-brown-300 bg-beige-100 px-3 py-2 text-sm text-black-500">
                                GROUP（題組結構不可變更）
                              </span>
                            ) : (
                              <select
                                value={editType}
                                onChange={(e) => setEditType(e.target.value)}
                                className="rounded-md border border-brown-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-700"
                              >
                                {QUESTION_TYPES.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-sm font-medium text-black-700">試卷</label>
                            <select
                              value={editExamId}
                              onChange={(e) => setEditExamId(e.target.value)}
                              className="rounded-md border border-brown-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-700"
                            >
                              <option value="">-- 選擇試卷 --</option>
                              {editSubject.exams.map((exam) => (
                                <option key={exam.id} value={exam.id}>
                                  {exam.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-sm font-medium text-black-700">內容 (content)</label>
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="h-32 w-full rounded-lg border border-brown-300 p-3 font-mono text-sm"
                          />
                        </div>

                        <div>
                          <p className="mb-1 text-sm font-medium text-black-700">預覽</p>
                          <div className="min-h-[60px] rounded-lg border border-brown-300 bg-beige-100 p-3">
                            {editContent ? (
                              <MathJax dynamic>
                                <div
                                  dangerouslySetInnerHTML={{ __html: editContent }}
                                  className="prose prose-sm max-w-none"
                                />
                              </MathJax>
                            ) : (
                              <p className="text-sm text-black-200">尚無內容可預覽</p>
                            )}
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-sm font-medium text-black-700">選項 (options)</label>
                            <input
                              value={editOptions}
                              onChange={(e) => setEditOptions(e.target.value)}
                              className="rounded-md border border-brown-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-700"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-sm font-medium text-black-700">答案 (answer)</label>
                            <input
                              value={editAnswer}
                              onChange={(e) => setEditAnswer(e.target.value)}
                              className="rounded-md border border-brown-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-700"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-sm font-medium text-black-700">
                              初始難度 (1-10)
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={editDifficulty}
                              onChange={(e) => setEditDifficulty(e.target.value)}
                              className="rounded-md border border-brown-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-700"
                            />
                          </div>
                        </div>

                        {editSubject.tags.length > 0 && (
                          <MultiSelectField
                            label="標籤（可複選，可不選）"
                            options={editSubject.tags.map((tag) => ({
                              value: String(tag.id),
                              label: tag.name,
                            }))}
                            value={editTagIds}
                            onChange={setEditTagIds}
                          />
                        )}

                        <MultiSelectField
                          label="觀念（可複選，至少一個）"
                          options={editSubject.conceptGroups.map((group) => ({
                            groupLabel: group.name,
                            options: group.concepts.map((concept) => ({
                              value: String(concept.id),
                              label: concept.name,
                            })),
                          }))}
                          value={editConceptIds}
                          onChange={setEditConceptIds}
                        />

                        {editError && <p className="text-sm text-red-600">{editError}</p>}
                        {editConceptIds.length === 0 && (
                          <p className="text-sm text-red-600">請至少選擇一個觀念</p>
                        )}
                        {!editExamId && <p className="text-sm text-red-600">請選擇試卷</p>}

                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSave(row)}
                            disabled={savingId === row.id || !editExamId || editConceptIds.length === 0}
                            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-spirit-forest disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {savingId === row.id ? '儲存中…' : '儲存'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="rounded-md border border-brown-300 px-4 py-2 text-sm text-black-700 transition hover:bg-beige-200"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-black-500">{row.id}</td>
                      <td className="px-4 py-3 text-black-500">
                        {row.categories.length > 0 ? row.categories.join('、') : '—'}
                      </td>
                      <td className="px-4 py-3 text-black-900">{row.subject}</td>
                      <td className="px-4 py-3 text-black-700">
                        {/* The 題型 column is gone, so the one thing it
                            carried that the snippet cannot show -- that a
                            row stands for several questions -- is marked
                            here instead. */}
                        {row.isGroup && row.childCount > 0 && (
                          <span className="mr-2 rounded border border-brown-300 bg-beige-100 px-1.5 py-0.5 text-xs text-black-500">
                            題組 {row.childCount}
                          </span>
                        )}
                        {contentSnippet(row.content)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2 whitespace-nowrap">
                          <button
                            onClick={() => openPreview(row)}
                            disabled={loadingPreviewId === row.id}
                            className="rounded-md border border-brown-300 px-3 py-1.5 text-xs text-black-700 transition hover:bg-beige-200 disabled:opacity-50"
                          >
                            {loadingPreviewId === row.id ? '…' : '瀏覽'}
                          </button>
                          {/* Doubles as the status indicator, which is why
                              there is no separate 狀態 column: a row offering
                              「啟用」 is currently disabled, one offering
                              「停用」 is live. The disabled case is filled
                              rather than outlined so a page of unreviewed
                              questions is scannable at a glance. */}
                          <button
                            onClick={() => handleToggleEnabled(row)}
                            disabled={togglingId === row.id}
                            title={row.enabled ? '目前已啟用，點擊停用' : '目前停用中，點擊啟用'}
                            className={`rounded-md border px-3 py-1.5 text-xs transition disabled:opacity-50 ${
                              row.enabled
                                ? 'border-brown-300 text-black-700 hover:bg-beige-200'
                                : 'border-green-700 bg-green-700 font-medium text-white hover:bg-green-800'
                            }`}
                          >
                            {togglingId === row.id ? '…' : row.enabled ? '停用' : '啟用'}
                          </button>
                          <button
                            onClick={() => startEdit(row)}
                            disabled={loadingEditId === row.id}
                            className="rounded-md border border-brown-300 px-3 py-1.5 text-xs text-black-700 transition hover:bg-beige-200 disabled:opacity-50"
                          >
                            {loadingEditId === row.id ? '…' : '編輯'}
                          </button>
                          <button
                            onClick={() => handleDelete(row.id)}
                            disabled={deletingId === row.id}
                            className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            {deletingId === row.id ? '…' : '刪除'}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableFrame>

      <Pagination
        page={page}
        totalPages={totalPages}
        onChange={(p) => load(p, sortColumn, sortDirection)}
      />

      {preview && (
        <PreviewModal
          row={preview.row}
          detail={preview.detail}
          subject={preview.subject}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  )
}
