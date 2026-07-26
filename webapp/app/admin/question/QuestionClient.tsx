'use client'

import { useEffect, useState } from 'react'
import { apiDelete, apiFetch, apiPut, LIMIT } from '@/lib/api'
import MultiSelectField from '@/components/MultiSelectField'
import Pagination from '@/components/Pagination'
import SortableTh, { type SortDirection } from '@/components/SortableTh'
import type { Paginate } from '@/types/api'
import { MathJax } from 'better-react-mathjax'

type QuestionRow = {
  id: number
  subjectId: number
  subject: string
  type: string
  content: string | null
  options: string | null
  answer: string | null
  difficulty: number
  isGroup: boolean
  childCount: number
}

type QuestionDetail = QuestionRow & {
  examId: number | null
  tagIds: number[]
  conceptIds: number[]
}

type SubjectDetail = {
  id: number
  name: string
  exams: { id: number; name: string }[]
  tags: { id: number; name: string }[]
  conceptGroups: { id: number; name: string; concepts: { id: number; name: string }[] }[]
}

type SortColumn = 'id' | 'subject' | 'type' | 'difficulty'

const QUESTION_TYPES = ['GROUP', 'SINGLE', 'MULTIPLE', 'TRUE_FALSE', 'FILL']

const contentSnippet = (content: string | null) => {
  if (!content) return '-'
  const stripped = content.replace(/<[^>]+>/g, '')
  return stripped.length > 40 ? `${stripped.slice(0, 40)}…` : stripped
}

export default function QuestionClient() {
  const [questions, setQuestions] = useState<QuestionRow[] | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sortColumn, setSortColumn] = useState<SortColumn>('id')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

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

  const load = async (
    targetPage: number,
    sort: SortColumn,
    order: SortDirection
  ) => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<Paginate<QuestionRow>>('question', {
        limit: LIMIT,
        offset: (targetPage - 1) * LIMIT,
        sort,
        order,
      })
      setQuestions(res.data)
      setTotalPages(res.paginate.totalPages)
      setPage(targetPage)
    } catch {
      setError('無法載入題目列表。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(1, sortColumn, sortDirection)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startEdit = async (row: QuestionRow) => {
    setLoadingEditId(row.id)
    setEditError(null)
    try {
      const [detail, subjectDetail] = await Promise.all([
        apiFetch<QuestionDetail>(`question/${row.id}`),
        apiFetch<SubjectDetail>(`subject/${row.subjectId}`),
      ])
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
    return (
      <div className="flex h-48 items-center justify-center">
        <span className="text-sm text-black-500">載入中…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mt-[60px] rounded-[24px] border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    )
  }

  return (
    <div className="pb-[70px]">
      <h1 className="mt-[60px] mb-6 text-3xl font-bold text-blue-700">題目管理</h1>
      <p className="mb-6 text-sm text-black-500">
        題目透過「新增題目」流程建立，此頁面僅供檢視、編輯與刪除。
      </p>

      <div className="mt-4 overflow-x-auto rounded-lg border border-brown-300 bg-white/40">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-brown-300/60 text-xs font-medium text-black-700">
              <SortableTh label="ID" column="id" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <SortableTh label="科目" column="subject" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <SortableTh label="題型" column="type" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <th className="px-4 py-3">內容預覽</th>
              <SortableTh label="難度" column="difficulty" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {(questions ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-black-300">
                  尚無題目
                </td>
              </tr>
            )}
            {(questions ?? []).map((row) => {
              const isEditing = editingId === row.id
              return (
                <tr key={row.id} className="border-b border-brown-300/30 last:border-0">
                  {isEditing && editSubject ? (
                    <td colSpan={6} className="px-4 py-4">
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
                            <label className="text-sm font-medium text-black-700">難度 (1-10)</label>
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
                            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-[#1f3ea3] disabled:cursor-not-allowed disabled:opacity-50"
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
                      <td className="px-4 py-3 text-black-900">{row.subject}</td>
                      <td className="px-4 py-3 text-black-500">
                        {row.type}
                        {row.isGroup && row.childCount > 0 && (
                          <span className="ml-1 text-xs text-black-300">
                            （含 {row.childCount} 子題）
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-black-700">{contentSnippet(row.content)}</td>
                      <td className="px-4 py-3 text-black-500">{row.difficulty}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => startEdit(row)}
                            disabled={loadingEditId === row.id}
                            className="rounded-md border border-brown-300 px-3 py-1.5 text-xs text-black-700 transition hover:bg-beige-200 disabled:opacity-50"
                          >
                            {loadingEditId === row.id ? '載入中…' : '編輯'}
                          </button>
                          <button
                            onClick={() => handleDelete(row.id)}
                            disabled={deletingId === row.id}
                            className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            {deletingId === row.id ? '刪除中…' : '刪除'}
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
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        onChange={(p) => load(p, sortColumn, sortDirection)}
      />
    </div>
  )
}
