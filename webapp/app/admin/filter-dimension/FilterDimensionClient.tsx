'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { apiDelete, apiFetch, apiPost, apiPut, LIMIT } from '@/lib/api'
import Pagination from '@/components/Pagination'
import SortableTh, { type SortDirection } from '@/components/SortableTh'
import type { Category, Paginate } from '@/types/api'

// High enough to fetch every category in one page for the picker dropdown
// -- there's no realistic admin dataset near this size yet.
const ALL_ITEMS_LIMIT = 1000

type FilterDimensionDto = {
  id: number
  name: string
  categoryId: number
  sortOrder: number
}

type SortColumn = 'id' | 'name' | 'sortOrder' | 'category'

export default function FilterDimensionClient() {
  const [dimensions, setDimensions] = useState<FilterDimensionDto[] | null>(null)
  const [allCategories, setAllCategories] = useState<Category[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sortColumn, setSortColumn] = useState<SortColumn>('sortOrder')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const [newName, setNewName] = useState('')
  const [newCategoryId, setNewCategoryId] = useState('')
  const [newSortOrder, setNewSortOrder] = useState('0')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editCategoryId, setEditCategoryId] = useState('')
  const [editSortOrder, setEditSortOrder] = useState('0')
  const [savingId, setSavingId] = useState<number | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<number | null>(null)

  const categoryById = useMemo(
    () => new Map(allCategories.map((c) => [c.id, c])),
    [allCategories]
  )

  const load = async (
    targetPage: number,
    sort: SortColumn,
    order: SortDirection
  ) => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<Paginate<FilterDimensionDto>>('filter-dimension', {
        limit: LIMIT,
        offset: (targetPage - 1) * LIMIT,
        sort,
        order,
      })
      setDimensions(res.data)
      setTotalPages(res.paginate.totalPages)
      setPage(targetPage)
    } catch {
      setError('無法載入篩選維度列表。')
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
    if (!name || !newCategoryId) return

    setCreating(true)
    setCreateError(null)
    try {
      await apiPost<FilterDimensionDto>('filter-dimension', {
        name,
        categoryId: Number(newCategoryId),
        sortOrder: Number(newSortOrder) || 0,
      })
      setNewName('')
      setNewCategoryId('')
      setNewSortOrder('0')
      await load(page, sortColumn, sortDirection)
    } catch {
      setCreateError('新增失敗，請稍後再試。')
    } finally {
      setCreating(false)
    }
  }

  const startEdit = (dimension: FilterDimensionDto) => {
    setEditingId(dimension.id)
    setEditName(dimension.name)
    setEditCategoryId(String(dimension.categoryId))
    setEditSortOrder(String(dimension.sortOrder))
    setEditError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditCategoryId('')
    setEditSortOrder('0')
    setEditError(null)
  }

  const handleUpdate = async (id: number) => {
    const name = editName.trim()
    if (!name || !editCategoryId) return

    setSavingId(id)
    setEditError(null)
    try {
      await apiPut<FilterDimensionDto>(`filter-dimension/${id}`, {
        name,
        categoryId: Number(editCategoryId),
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
    if (!confirm('確定要刪除這個篩選維度嗎？若其下仍有篩選選項，刪除將會失敗。')) return

    setDeletingId(id)
    try {
      await apiDelete(`filter-dimension/${id}`)
      await load(page, sortColumn, sortDirection)
    } catch {
      alert('刪除失敗，請確認其下沒有篩選選項後再試。')
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

  if (loading && dimensions === null) {
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
      <h1 className="mt-[60px] mb-6 text-3xl font-bold text-blue-700">篩選維度管理</h1>
      <p className="mb-6 text-sm text-black-500">
        篩選維度是每個類別下的篩選分組（例如「類科分組」、「類科選擇」），排序決定在篩選畫面中由上而下的顯示順序。
      </p>

      <form
        onSubmit={handleCreate}
        className="mb-2 flex items-center gap-3 rounded-lg border border-brown-300 bg-white/40 p-4"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新增篩選維度名稱"
          className="flex-1 rounded-md border border-brown-300 bg-white px-3 py-2 text-sm text-black-900 outline-none focus:border-blue-700"
        />
        <select
          value={newCategoryId}
          onChange={(e) => setNewCategoryId(e.target.value)}
          className="w-56 rounded-md border border-brown-300 bg-white px-3 py-2 text-sm text-black-900 outline-none focus:border-blue-700"
        >
          <option value="">-- 選擇類別 --</option>
          {allCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
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
          disabled={creating || newName.trim() === '' || !newCategoryId}
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
              <SortableTh label="類別" column="category" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <SortableTh label="排序" column="sortOrder" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {(dimensions ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-black-300">
                  尚無篩選維度
                </td>
              </tr>
            )}
            {(dimensions ?? []).map((dimension) => {
              const isEditing = editingId === dimension.id
              return (
                <tr key={dimension.id} className="border-b border-brown-300/30 last:border-0">
                  <td className="px-4 py-3 text-black-500">{dimension.id}</td>
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
                      <span className="text-black-900">{dimension.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-black-500">
                    {isEditing ? (
                      <select
                        value={editCategoryId}
                        onChange={(e) => setEditCategoryId(e.target.value)}
                        className="w-full rounded-md border border-brown-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-700"
                      >
                        {allCategories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      categoryById.get(dimension.categoryId)?.name ?? '-'
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
                      <span className="text-black-500">{dimension.sortOrder}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleUpdate(dimension.id)}
                            disabled={savingId === dimension.id}
                            className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#1f3ea3] disabled:opacity-50"
                          >
                            {savingId === dimension.id ? '儲存中…' : '儲存'}
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
                            onClick={() => startEdit(dimension)}
                            className="rounded-md border border-brown-300 px-3 py-1.5 text-xs text-black-700 transition hover:bg-beige-200"
                          >
                            編輯
                          </button>
                          <button
                            onClick={() => handleDelete(dimension.id)}
                            disabled={deletingId === dimension.id}
                            className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            {deletingId === dimension.id ? '刪除中…' : '刪除'}
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
