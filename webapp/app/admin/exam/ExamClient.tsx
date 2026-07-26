'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { apiDelete, apiFetch, apiPost, apiPut } from '@/lib/api'
import MultiSelectField from '@/components/MultiSelectField'
import SortableTh, { type SortDirection } from '@/components/SortableTh'

type ExamDto = {
  id: number
  name: string
  createdAt: string | null
  // Read-only summary of the exam's linked subjects (many-to-many). Not
  // editable here -- comes pre-formatted as a CSV string from the API.
  subjects: string | null
}

// Subject names aren't unique, so the picker needs each subject's
// categories alongside its name to tell duplicates apart.
type SubjectOption = { id: number; name: string; categories: string | null }

type SortColumn = 'id' | 'name' | 'subjects'

export default function ExamClient() {
  const [exams, setExams] = useState<ExamDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sortColumn, setSortColumn] = useState<SortColumn>('id')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [savingId, setSavingId] = useState<number | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<number | null>(null)

  const [allSubjects, setAllSubjects] = useState<SubjectOption[]>([])
  const [editingRelationId, setEditingRelationId] = useState<number | null>(null)
  const [loadingRelationId, setLoadingRelationId] = useState<number | null>(null)
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([])
  const [savingRelationId, setSavingRelationId] = useState<number | null>(null)
  const [relationError, setRelationError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      apiFetch<ExamDto[]>('exam'),
      apiFetch<SubjectOption[]>('subject'),
    ])
      .then(([exams, subjects]) => {
        setExams(exams)
        setAllSubjects(subjects)
      })
      .catch(() => setError('無法載入考試列表。'))
      .finally(() => setLoading(false))
  }, [])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return

    setCreating(true)
    setCreateError(null)
    try {
      const created = await apiPost<ExamDto>('exam', { name })
      // POST doesn't return subject links -- a brand-new exam has none yet.
      setExams((prev) => [...prev, { ...created, subjects: null }])
      setNewName('')
    } catch {
      setCreateError('新增失敗，請確認名稱未重複。')
    } finally {
      setCreating(false)
    }
  }

  const startEdit = (exam: ExamDto) => {
    setEditingId(exam.id)
    setEditName(exam.name)
    setEditError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditError(null)
  }

  const handleUpdate = async (id: number) => {
    const name = editName.trim()
    if (!name) return

    setSavingId(id)
    setEditError(null)
    try {
      const updated = await apiPut<ExamDto>(`exam/${id}`, { name })
      // PUT doesn't touch subject links -- carry the existing row's value
      // forward instead of overwriting it with whatever the API omitted.
      setExams((prev) =>
        prev.map((e) => (e.id === id ? { ...updated, subjects: e.subjects } : e))
      )
      setEditingId(null)
    } catch {
      setEditError('更新失敗，請確認名稱未重複。')
    } finally {
      setSavingId(null)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('確定要刪除這個考試嗎？')) return

    setDeletingId(id)
    try {
      await apiDelete(`exam/${id}`)
      setExams((prev) => prev.filter((e) => e.id !== id))
    } catch {
      alert('刪除失敗，請稍後再試。')
    } finally {
      setDeletingId(null)
    }
  }

  const startEditRelation = async (id: number) => {
    setLoadingRelationId(id)
    setRelationError(null)
    try {
      const { subjectIds } = await apiFetch<{ subjectIds: number[] }>(
        `exam/${id}/subject`
      )
      setSelectedSubjectIds(subjectIds.map(String))
      setEditingRelationId(id)
    } catch {
      setRelationError('無法載入目前的科目關聯。')
    } finally {
      setLoadingRelationId(null)
    }
  }

  const cancelEditRelation = () => {
    setEditingRelationId(null)
    setSelectedSubjectIds([])
    setRelationError(null)
  }

  const handleSaveRelation = async (id: number) => {
    setSavingRelationId(id)
    setRelationError(null)
    try {
      const { subjectIds } = await apiPut<{ subjectIds: number[] }>(
        `exam/${id}/subject`,
        { subjectIds: selectedSubjectIds.map(Number) }
      )
      const subjects =
        allSubjects
          .filter((s) => subjectIds.includes(s.id))
          .map((s) => s.name)
          .sort((a, b) => a.localeCompare(b))
          .join(', ') || null
      setExams((prev) =>
        prev.map((e) => (e.id === id ? { ...e, subjects } : e))
      )
      setEditingRelationId(null)
    } catch {
      setRelationError('更新科目關聯失敗，請稍後再試。')
    } finally {
      setSavingRelationId(null)
    }
  }

  const handleSort = (column: SortColumn) => {
    if (column === sortColumn) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const sortedExams = useMemo(() => {
    const dir = sortDirection === 'asc' ? 1 : -1
    return [...exams].sort((a, b) => {
      if (sortColumn === 'id') return (a.id - b.id) * dir
      if (sortColumn === 'subjects')
        return (a.subjects ?? '').localeCompare(b.subjects ?? '') * dir
      return a.name.localeCompare(b.name) * dir
    })
  }, [exams, sortColumn, sortDirection])

  if (loading) {
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
      <h1 className="mt-[60px] mb-6 text-3xl font-bold text-blue-700">考試管理</h1>

      <form
        onSubmit={handleCreate}
        className="mb-2 flex items-center gap-3 rounded-lg border border-brown-300 bg-white/40 p-4"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新增考試名稱"
          className="flex-1 rounded-md border border-brown-300 bg-white px-3 py-2 text-sm text-black-900 outline-none focus:border-blue-700"
        />
        <button
          type="submit"
          disabled={creating || newName.trim() === ''}
          className="shrink-0 rounded-md bg-blue-700 px-5 py-2 text-sm font-bold text-white transition hover:bg-[#1f3ea3] disabled:opacity-50"
        >
          {creating ? '新增中…' : '新增'}
        </button>
      </form>
      {createError && <p className="mb-4 text-sm text-red-600">{createError}</p>}

      <div className="mt-4 overflow-x-auto rounded-lg border border-brown-300 bg-white/40">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-brown-300/60 text-xs font-medium text-black-700">
              <SortableTh label="ID" column="id" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <SortableTh label="名稱" column="name" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <SortableTh label="科目" column="subjects" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {sortedExams.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-black-300">
                  尚無考試
                </td>
              </tr>
            )}
            {sortedExams.map((exam) => {
              const isEditing = editingId === exam.id
              return (
                <tr key={exam.id} className="border-b border-brown-300/30 last:border-0">
                  <td className="px-4 py-3 text-black-500">{exam.id}</td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-md border border-brown-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-700"
                          autoFocus
                        />
                        {editError && <p className="mt-1 text-xs text-red-600">{editError}</p>}
                      </>
                    ) : (
                      <span className="text-black-900">{exam.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-black-500">
                    {editingRelationId === exam.id ? (
                      <div className="flex min-w-55 flex-col gap-2">
                        <MultiSelectField
                          label=""
                          options={allSubjects.map((s) => ({
                            value: String(s.id),
                            label: s.categories ? `${s.name}（${s.categories}）` : s.name,
                          }))}
                          value={selectedSubjectIds}
                          onChange={setSelectedSubjectIds}
                        />
                        {relationError && (
                          <p className="text-xs text-red-600">{relationError}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveRelation(exam.id)}
                            disabled={savingRelationId === exam.id}
                            className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#1f3ea3] disabled:opacity-50"
                          >
                            {savingRelationId === exam.id ? '儲存中…' : '儲存'}
                          </button>
                          <button
                            onClick={cancelEditRelation}
                            className="rounded-md border border-brown-300 px-3 py-1.5 text-xs text-black-700 transition hover:bg-beige-200"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      exam.subjects ?? '-'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleUpdate(exam.id)}
                            disabled={savingId === exam.id}
                            className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#1f3ea3] disabled:opacity-50"
                          >
                            {savingId === exam.id ? '儲存中…' : '儲存'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="rounded-md border border-brown-300 px-3 py-1.5 text-xs text-black-700 transition hover:bg-beige-200"
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(exam)}
                            className="rounded-md border border-brown-300 px-3 py-1.5 text-xs text-black-700 transition hover:bg-beige-200"
                          >
                            編輯
                          </button>
                          {editingRelationId !== exam.id && (
                            <button
                              onClick={() => startEditRelation(exam.id)}
                              disabled={loadingRelationId === exam.id}
                              className="rounded-md border border-brown-300 px-3 py-1.5 text-xs text-black-700 transition hover:bg-beige-200 disabled:opacity-50"
                            >
                              {loadingRelationId === exam.id ? '載入中…' : '編輯關聯'}
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(exam.id)}
                            disabled={deletingId === exam.id}
                            className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            {deletingId === exam.id ? '刪除中…' : '刪除'}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
