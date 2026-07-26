'use client'

import { FormEvent, useEffect, useState } from 'react'
import { apiDelete, apiFetch, apiPost, apiPut, LIMIT } from '@/lib/api'
import MultiSelectField from '@/components/MultiSelectField'
import Pagination from '@/components/Pagination'
import SortableTh, { type SortDirection } from '@/components/SortableTh'
import type { Category, Paginate } from '@/types/api'

// High enough to fetch every category in one page for the relation-editor
// dropdown -- there's no realistic admin dataset near this size yet.
const ALL_ITEMS_LIMIT = 1000

type SubjectDto = {
  id: number
  name: string
  sortOrder: number
  createdAt: string | null
  // Read-only summary of the subject's linked categories (many-to-many).
  // Not editable here -- comes pre-formatted as a CSV string from the API.
  categories: string | null
}

type SortColumn = 'id' | 'name' | 'sortOrder' | 'categories'

export default function SubjectClient() {
  const [subjects, setSubjects] = useState<SubjectDto[] | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sortColumn, setSortColumn] = useState<SortColumn>('sortOrder')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const [newName, setNewName] = useState('')
  const [newSortOrder, setNewSortOrder] = useState('0')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editSortOrder, setEditSortOrder] = useState('0')
  const [savingId, setSavingId] = useState<number | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<number | null>(null)

  const [allCategories, setAllCategories] = useState<Category[]>([])
  const [editingRelationId, setEditingRelationId] = useState<number | null>(null)
  const [loadingRelationId, setLoadingRelationId] = useState<number | null>(null)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [savingRelationId, setSavingRelationId] = useState<number | null>(null)
  const [relationError, setRelationError] = useState<string | null>(null)

  const load = async (
    targetPage: number,
    sort: SortColumn,
    order: SortDirection
  ) => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<Paginate<SubjectDto>>('subject', {
        limit: LIMIT,
        offset: (targetPage - 1) * LIMIT,
        sort,
        order,
      })
      setSubjects(res.data)
      setTotalPages(res.paginate.totalPages)
      setPage(targetPage)
    } catch {
      setError('無法載入科目列表。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(1, sortColumn, sortDirection)
    apiFetch<Paginate<Category>>('category', { limit: ALL_ITEMS_LIMIT })
      .then((res) => setAllCategories(res.data))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return

    setCreating(true)
    setCreateError(null)
    try {
      await apiPost<SubjectDto>('subject', {
        name,
        sortOrder: Number(newSortOrder) || 0,
      })
      setNewName('')
      setNewSortOrder('0')
      await load(page, sortColumn, sortDirection)
    } catch {
      setCreateError('新增失敗，請稍後再試。')
    } finally {
      setCreating(false)
    }
  }

  const startEdit = (subject: SubjectDto) => {
    setEditingId(subject.id)
    setEditName(subject.name)
    setEditSortOrder(String(subject.sortOrder))
    setEditError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditSortOrder('0')
    setEditError(null)
  }

  const handleUpdate = async (id: number) => {
    const name = editName.trim()
    if (!name) return

    setSavingId(id)
    setEditError(null)
    try {
      await apiPut<SubjectDto>(`subject/${id}`, {
        name,
        sortOrder: Number(editSortOrder) || 0,
      })
      setEditingId(null)
      await load(page, sortColumn, sortDirection)
    } catch {
      setEditError('更新失敗，請稍後再試。')
    } finally {
      setSavingId(null)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('確定要刪除這個科目嗎？')) return

    setDeletingId(id)
    try {
      await apiDelete(`subject/${id}`)
      await load(page, sortColumn, sortDirection)
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
      const { categoryIds } = await apiFetch<{ categoryIds: number[] }>(
        `subject/${id}/category`
      )
      setSelectedCategoryIds(categoryIds.map(String))
      setEditingRelationId(id)
    } catch {
      setRelationError('無法載入目前的類別關聯。')
    } finally {
      setLoadingRelationId(null)
    }
  }

  const cancelEditRelation = () => {
    setEditingRelationId(null)
    setSelectedCategoryIds([])
    setRelationError(null)
  }

  const handleSaveRelation = async (id: number) => {
    setSavingRelationId(id)
    setRelationError(null)
    try {
      await apiPut<{ categoryIds: number[] }>(`subject/${id}/category`, {
        categoryIds: selectedCategoryIds.map(Number),
      })
      setEditingRelationId(null)
      await load(page, sortColumn, sortDirection)
    } catch {
      setRelationError('更新類別關聯失敗，請稍後再試。')
    } finally {
      setSavingRelationId(null)
    }
  }

  const handleSort = (column: SortColumn) => {
    const direction =
      column === sortColumn ? (sortDirection === 'asc' ? 'desc' : 'asc') : 'asc'
    setSortColumn(column)
    setSortDirection(direction)
    load(1, column, direction)
  }

  if (loading && subjects === null) {
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
      <h1 className="mt-[60px] mb-6 text-3xl font-bold text-blue-700">科目管理</h1>

      <form
        onSubmit={handleCreate}
        className="mb-2 flex items-center gap-3 rounded-lg border border-brown-300 bg-white/40 p-4"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新增科目名稱"
          className="flex-1 rounded-md border border-brown-300 bg-white px-3 py-2 text-sm text-black-900 outline-none focus:border-blue-700"
        />
        <input
          type="number"
          min={0}
          max={255}
          value={newSortOrder}
          onChange={(e) => setNewSortOrder(e.target.value)}
          placeholder="排序"
          className="w-24 rounded-md border border-brown-300 bg-white px-3 py-2 text-sm text-black-900 outline-none focus:border-blue-700"
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
              <SortableTh label="排序" column="sortOrder" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <SortableTh label="類別" column="categories" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {(subjects ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-black-300">
                  尚無科目
                </td>
              </tr>
            )}
            {(subjects ?? []).map((subject) => {
              const isEditing = editingId === subject.id
              return (
                <tr key={subject.id} className="border-b border-brown-300/30 last:border-0">
                  <td className="px-4 py-3 text-black-500">{subject.id}</td>
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
                      <span className="text-black-900">{subject.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <input
                        type="number"
                        min={0}
                        max={255}
                        value={editSortOrder}
                        onChange={(e) => setEditSortOrder(e.target.value)}
                        className="w-20 rounded-md border border-brown-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-700"
                      />
                    ) : (
                      <span className="text-black-500">{subject.sortOrder}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-black-500">
                    {editingRelationId === subject.id ? (
                      <div className="flex min-w-55 flex-col gap-2">
                        <MultiSelectField
                          label=""
                          options={allCategories.map((c) => ({
                            value: String(c.id),
                            label: c.name,
                          }))}
                          value={selectedCategoryIds}
                          onChange={setSelectedCategoryIds}
                        />
                        {relationError && (
                          <p className="text-xs text-red-600">{relationError}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveRelation(subject.id)}
                            disabled={savingRelationId === subject.id}
                            className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#1f3ea3] disabled:opacity-50"
                          >
                            {savingRelationId === subject.id ? '儲存中…' : '儲存'}
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
                      subject.categories ?? '-'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleUpdate(subject.id)}
                            disabled={savingId === subject.id}
                            className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#1f3ea3] disabled:opacity-50"
                          >
                            {savingId === subject.id ? '儲存中…' : '儲存'}
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
                            onClick={() => startEdit(subject)}
                            className="rounded-md border border-brown-300 px-3 py-1.5 text-xs text-black-700 transition hover:bg-beige-200"
                          >
                            編輯
                          </button>
                          {editingRelationId !== subject.id && (
                            <button
                              onClick={() => startEditRelation(subject.id)}
                              disabled={loadingRelationId === subject.id}
                              className="rounded-md border border-brown-300 px-3 py-1.5 text-xs text-black-700 transition hover:bg-beige-200 disabled:opacity-50"
                            >
                              {loadingRelationId === subject.id
                                ? '載入中…'
                                : '編輯關聯'}
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(subject.id)}
                            disabled={deletingId === subject.id}
                            className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            {deletingId === subject.id ? '刪除中…' : '刪除'}
                          </button>
                          <a
                            href={`/admin/subject/new-question?id=${subject.id}`}
                            className="rounded-md border border-brown-300 px-3 py-1.5 text-xs text-black-700 transition hover:bg-beige-200"
                          >
                            新增題目
                          </a>
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
