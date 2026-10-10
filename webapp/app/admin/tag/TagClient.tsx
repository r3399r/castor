'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { apiDelete, apiFetch, apiPost, apiPut, LIMIT } from '@/lib/api'
import Pagination from '@/components/Pagination'
import { Button, ErrorState, FormPanel, LoadingState, PageHeader, TableFrame } from '@/components/ui'
import SortableTh, { type SortDirection } from '@/components/SortableTh'
import type { Paginate } from '@/types/api'

// High enough to fetch every subject in one page for the picker dropdown --
// there's no realistic admin dataset near this size yet.
const ALL_ITEMS_LIMIT = 1000

type TagDto = {
  id: number
  name: string
  subjectId: number
  createdAt: string | null
}

// Subject names aren't unique, so the picker needs each subject's
// categories alongside its name to tell duplicates apart.
type SubjectOption = { id: number; name: string; categories: string | null }

type SortColumn = 'id' | 'name' | 'subject'

// Flat, dash-separated label for the picker dropdown, where a single line
// of text is all we have to disambiguate same-named subjects.
const subjectOptionLabel = (subject: SubjectOption) =>
  subject.categories ? `${subject.name} - ${subject.categories}` : subject.name

export default function TagClient() {
  const [tags, setTags] = useState<TagDto[] | null>(null)
  const [allSubjects, setAllSubjects] = useState<SubjectOption[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sortColumn, setSortColumn] = useState<SortColumn>('id')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const [newName, setNewName] = useState('')
  const [newSubjectId, setNewSubjectId] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editSubjectId, setEditSubjectId] = useState('')
  const [savingId, setSavingId] = useState<number | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<number | null>(null)

  const subjectById = useMemo(
    () => new Map(allSubjects.map((s) => [s.id, s])),
    [allSubjects]
  )

  const load = async (
    targetPage: number,
    sort: SortColumn,
    order: SortDirection
  ) => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<Paginate<TagDto>>('tag', {
        limit: LIMIT,
        offset: (targetPage - 1) * LIMIT,
        sort,
        order,
      })
      setTags(res.data)
      setTotalPages(res.paginate.totalPages)
      setPage(targetPage)
    } catch {
      setError('無法載入標籤列表。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(1, sortColumn, sortDirection)
    apiFetch<Paginate<SubjectOption>>('subject', { limit: ALL_ITEMS_LIMIT })
      .then((res) => setAllSubjects(res.data))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name || !newSubjectId) return

    setCreating(true)
    setCreateError(null)
    try {
      await apiPost<TagDto>('tag', {
        name,
        subjectId: Number(newSubjectId),
      })
      setNewName('')
      setNewSubjectId('')
      await load(page, sortColumn, sortDirection)
    } catch {
      setCreateError('新增失敗，請確認名稱在該科目下未重複。')
    } finally {
      setCreating(false)
    }
  }

  const startEdit = (tag: TagDto) => {
    setEditingId(tag.id)
    setEditName(tag.name)
    setEditSubjectId(String(tag.subjectId))
    setEditError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditSubjectId('')
    setEditError(null)
  }

  const handleUpdate = async (id: number) => {
    const name = editName.trim()
    if (!name || !editSubjectId) return

    setSavingId(id)
    setEditError(null)
    try {
      await apiPut<TagDto>(`tag/${id}`, {
        name,
        subjectId: Number(editSubjectId),
      })
      setEditingId(null)
      await load(page, sortColumn, sortDirection)
    } catch {
      setEditError('更新失敗，請確認名稱在該科目下未重複。')
    } finally {
      setSavingId(null)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('確定要刪除這個標籤嗎？')) return

    setDeletingId(id)
    try {
      await apiDelete(`tag/${id}`)
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

  if (loading && tags === null) {
    return <LoadingState />
  }

  if (error) {
    return <ErrorState>{error}</ErrorState>
  }

  return (
    <div className="pb-[70px]">
      <PageHeader title="標籤管理" />

      <FormPanel
        onSubmit={handleCreate}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新增標籤名稱"
          className="flex-1 rounded-md border border-brown-300 bg-white px-3 py-2 text-sm text-black-900 outline-none focus:border-blue-700"
        />
        <select
          value={newSubjectId}
          onChange={(e) => setNewSubjectId(e.target.value)}
          className="w-56 rounded-md border border-brown-300 bg-white px-3 py-2 text-sm text-black-900 outline-none focus:border-blue-700"
        >
          <option value="">-- 選擇科目 --</option>
          {allSubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {subjectOptionLabel(s)}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={creating || newName.trim() === '' || !newSubjectId} loading={creating} className="shrink-0">
          {creating ? '新增中…' : '新增'}
        </Button>
      </FormPanel>
      {createError && <p className="mb-4 text-sm text-red-600">{createError}</p>}

      <TableFrame className="mt-4">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-brown-300/60 text-xs font-medium text-black-700">
              <SortableTh label="ID" column="id" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <SortableTh label="名稱" column="name" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <SortableTh label="科目" column="subject" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <th className="px-4 py-3">類別</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {(tags ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-black-300">
                  尚無標籤
                </td>
              </tr>
            )}
            {(tags ?? []).map((tag) => {
              const isEditing = editingId === tag.id
              return (
                <tr key={tag.id} className="border-b border-brown-300/30 last:border-0">
                  <td className="px-4 py-3 text-black-500">{tag.id}</td>
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
                      <span className="text-black-900">{tag.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-black-500">
                    {isEditing ? (
                      <select
                        value={editSubjectId}
                        onChange={(e) => setEditSubjectId(e.target.value)}
                        className="w-full rounded-md border border-brown-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-700"
                      >
                        {allSubjects.map((s) => (
                          <option key={s.id} value={s.id}>
                            {subjectOptionLabel(s)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      subjectById.get(tag.subjectId)?.name ?? '-'
                    )}
                  </td>
                  <td className="px-4 py-3 text-black-500">
                    {(isEditing
                      ? subjectById.get(Number(editSubjectId))?.categories
                      : subjectById.get(tag.subjectId)?.categories) ?? '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleUpdate(tag.id)}
                            disabled={savingId === tag.id}
                            className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-spirit-forest disabled:opacity-50"
                          >
                            {savingId === tag.id ? '儲存中…' : '儲存'}
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
                            onClick={() => startEdit(tag)}
                            className="rounded-md border border-brown-300 px-3 py-1.5 text-xs text-black-700 transition hover:bg-beige-200"
                          >
                            編輯
                          </button>
                          <button
                            onClick={() => handleDelete(tag.id)}
                            disabled={deletingId === tag.id}
                            className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            {deletingId === tag.id ? '刪除中…' : '刪除'}
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
      </TableFrame>

      <Pagination
        page={page}
        totalPages={totalPages}
        onChange={(p) => load(p, sortColumn, sortDirection)}
      />
    </div>
  )
}
