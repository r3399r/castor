'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { apiDelete, apiFetch, apiPost, apiPut, LIMIT } from '@/lib/api'
import Pagination from '@/components/Pagination'
import SortableTh, { type SortDirection } from '@/components/SortableTh'
import type { Paginate } from '@/types/api'

// High enough to fetch every concept group / subject in one page for the
// picker dropdown -- there's no realistic admin dataset near this size yet.
const ALL_ITEMS_LIMIT = 1000

type ConceptDto = {
  id: number
  name: string
  conceptGroupId: number
  // Counted elsewhere as questions get added -- read-only here, never
  // part of the create/edit form.
  numberOfQuestions: number
  createdAt: string | null
}

// Concept group names aren't unique across subjects, and subject names
// aren't unique across categories, so the picker needs the full
// conceptGroup -> subject -> category chain to tell duplicates apart.
type ConceptGroupOption = { id: number; name: string; subjectId: number }
type SubjectOption = { id: number; name: string; categories: string | null }

type SortColumn = 'id' | 'name' | 'conceptGroup' | 'numberOfQuestions'

export default function ConceptClient() {
  const [concepts, setConcepts] = useState<ConceptDto[] | null>(null)
  const [allConceptGroups, setAllConceptGroups] = useState<ConceptGroupOption[]>([])
  const [allSubjects, setAllSubjects] = useState<SubjectOption[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sortColumn, setSortColumn] = useState<SortColumn>('id')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const [newName, setNewName] = useState('')
  const [newConceptGroupId, setNewConceptGroupId] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editConceptGroupId, setEditConceptGroupId] = useState('')
  const [savingId, setSavingId] = useState<number | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<number | null>(null)

  const subjectById = useMemo(
    () => new Map(allSubjects.map((s) => [s.id, s])),
    [allSubjects]
  )
  const conceptGroupById = useMemo(
    () => new Map(allConceptGroups.map((cg) => [cg.id, cg])),
    [allConceptGroups]
  )

  // Flat, dash-separated label for the picker dropdown, where a single line
  // of text is all we have to disambiguate same-named concept groups.
  const conceptGroupOptionLabel = (conceptGroup: ConceptGroupOption) => {
    const subject = subjectById.get(conceptGroup.subjectId)
    const parts = [conceptGroup.name, subject?.name, subject?.categories].filter(Boolean)
    return parts.join(' - ')
  }

  const load = async (
    targetPage: number,
    sort: SortColumn,
    order: SortDirection
  ) => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<Paginate<ConceptDto>>('concept', {
        limit: LIMIT,
        offset: (targetPage - 1) * LIMIT,
        sort,
        order,
      })
      setConcepts(res.data)
      setTotalPages(res.paginate.totalPages)
      setPage(targetPage)
    } catch {
      setError('無法載入觀念列表。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(1, sortColumn, sortDirection)
    apiFetch<Paginate<ConceptGroupOption>>('concept-group', { limit: ALL_ITEMS_LIMIT })
      .then((res) => setAllConceptGroups(res.data))
      .catch(() => {})
    apiFetch<Paginate<SubjectOption>>('subject', { limit: ALL_ITEMS_LIMIT })
      .then((res) => setAllSubjects(res.data))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name || !newConceptGroupId) return

    setCreating(true)
    setCreateError(null)
    try {
      await apiPost<ConceptDto>('concept', {
        name,
        conceptGroupId: Number(newConceptGroupId),
      })
      setNewName('')
      setNewConceptGroupId('')
      await load(page, sortColumn, sortDirection)
    } catch {
      setCreateError('新增失敗，請確認名稱在該觀念群組下未重複。')
    } finally {
      setCreating(false)
    }
  }

  const startEdit = (concept: ConceptDto) => {
    setEditingId(concept.id)
    setEditName(concept.name)
    setEditConceptGroupId(String(concept.conceptGroupId))
    setEditError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditConceptGroupId('')
    setEditError(null)
  }

  const handleUpdate = async (id: number) => {
    const name = editName.trim()
    if (!name || !editConceptGroupId) return

    setSavingId(id)
    setEditError(null)
    try {
      await apiPut<ConceptDto>(`concept/${id}`, {
        name,
        conceptGroupId: Number(editConceptGroupId),
      })
      setEditingId(null)
      await load(page, sortColumn, sortDirection)
    } catch {
      setEditError('更新失敗，請確認名稱在該觀念群組下未重複。')
    } finally {
      setSavingId(null)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('確定要刪除這個觀念嗎？')) return

    setDeletingId(id)
    try {
      await apiDelete(`concept/${id}`)
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

  if (loading && concepts === null) {
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
      <h1 className="mt-[60px] mb-6 text-3xl font-bold text-blue-700">觀念管理</h1>

      <form
        onSubmit={handleCreate}
        className="mb-2 flex items-center gap-3 rounded-lg border border-brown-300 bg-white/40 p-4"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新增觀念名稱"
          className="flex-1 rounded-md border border-brown-300 bg-white px-3 py-2 text-sm text-black-900 outline-none focus:border-blue-700"
        />
        <select
          value={newConceptGroupId}
          onChange={(e) => setNewConceptGroupId(e.target.value)}
          className="w-56 rounded-md border border-brown-300 bg-white px-3 py-2 text-sm text-black-900 outline-none focus:border-blue-700"
        >
          <option value="">-- 選擇觀念群組 --</option>
          {allConceptGroups.map((cg) => (
            <option key={cg.id} value={cg.id}>
              {conceptGroupOptionLabel(cg)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={creating || newName.trim() === '' || !newConceptGroupId}
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
              <SortableTh label="觀念群組" column="conceptGroup" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <th className="px-4 py-3">科目</th>
              <th className="px-4 py-3">類別</th>
              <SortableTh label="題目數" column="numberOfQuestions" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {(concepts ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-black-300">
                  尚無觀念
                </td>
              </tr>
            )}
            {(concepts ?? []).map((concept) => {
              const isEditing = editingId === concept.id
              return (
                <tr key={concept.id} className="border-b border-brown-300/30 last:border-0">
                  <td className="px-4 py-3 text-black-500">{concept.id}</td>
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
                      <span className="text-black-900">{concept.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-black-500">
                    {isEditing ? (
                      <select
                        value={editConceptGroupId}
                        onChange={(e) => setEditConceptGroupId(e.target.value)}
                        className="w-full rounded-md border border-brown-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-700"
                      >
                        {allConceptGroups.map((cg) => (
                          <option key={cg.id} value={cg.id}>
                            {conceptGroupOptionLabel(cg)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      conceptGroupById.get(concept.conceptGroupId)?.name ?? '-'
                    )}
                  </td>
                  <td className="px-4 py-3 text-black-500">
                    {(() => {
                      const groupId = isEditing ? Number(editConceptGroupId) : concept.conceptGroupId
                      const group = conceptGroupById.get(groupId)
                      const subject = group ? subjectById.get(group.subjectId) : undefined
                      return subject?.name ?? '-'
                    })()}
                  </td>
                  <td className="px-4 py-3 text-black-500">
                    {(() => {
                      const groupId = isEditing ? Number(editConceptGroupId) : concept.conceptGroupId
                      const group = conceptGroupById.get(groupId)
                      const subject = group ? subjectById.get(group.subjectId) : undefined
                      return subject?.categories ?? '-'
                    })()}
                  </td>
                  <td className="px-4 py-3 text-black-500">{concept.numberOfQuestions}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleUpdate(concept.id)}
                            disabled={savingId === concept.id}
                            className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#1f3ea3] disabled:opacity-50"
                          >
                            {savingId === concept.id ? '儲存中…' : '儲存'}
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
                            onClick={() => startEdit(concept)}
                            className="rounded-md border border-brown-300 px-3 py-1.5 text-xs text-black-700 transition hover:bg-beige-200"
                          >
                            編輯
                          </button>
                          <button
                            onClick={() => handleDelete(concept.id)}
                            disabled={deletingId === concept.id}
                            className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            {deletingId === concept.id ? '刪除中…' : '刪除'}
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

      <Pagination
        page={page}
        totalPages={totalPages}
        onChange={(p) => load(p, sortColumn, sortDirection)}
      />
    </div>
  )
}
