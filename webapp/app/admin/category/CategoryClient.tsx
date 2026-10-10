'use client'

import { FormEvent, useEffect, useState } from 'react'
import { apiDelete, apiFetch, apiPost, apiPut, LIMIT } from '@/lib/api'
import Pagination from '@/components/Pagination'
import { Button, ErrorState, FormPanel, LoadingState, PageHeader, TableFrame } from '@/components/ui'
import SortableTh, { type SortDirection } from '@/components/SortableTh'
import type { Category, Paginate } from '@/types/api'

type SortColumn = 'id' | 'name'

export default function CategoryClient() {
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
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

  const load = async (
    targetPage: number,
    sort: SortColumn,
    order: SortDirection
  ) => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<Paginate<Category>>('category', {
        limit: LIMIT,
        offset: (targetPage - 1) * LIMIT,
        sort,
        order,
      })
      setCategories(res.data)
      setTotalPages(res.paginate.totalPages)
      setPage(targetPage)
    } catch {
      setError('無法載入分類列表。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(1, sortColumn, sortDirection)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return

    setCreating(true)
    setCreateError(null)
    try {
      await apiPost<Category>('category', { name })
      setNewName('')
      await load(page, sortColumn, sortDirection)
    } catch {
      setCreateError('新增失敗，請確認名稱未重複。')
    } finally {
      setCreating(false)
    }
  }

  const startEdit = (category: Category) => {
    setEditingId(category.id)
    setEditName(category.name)
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
      await apiPut<Category>(`category/${id}`, { name })
      setEditingId(null)
      await load(page, sortColumn, sortDirection)
    } catch {
      setEditError('更新失敗，請確認名稱未重複。')
    } finally {
      setSavingId(null)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('確定要刪除這個分類嗎？')) return

    setDeletingId(id)
    try {
      await apiDelete(`category/${id}`)
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

  if (loading && categories === null) {
    return <LoadingState />
  }

  if (error) {
    return <ErrorState>{error}</ErrorState>
  }

  return (
    <div className="pb-page-bottom">
      <PageHeader title="分類管理" />

      <FormPanel
        onSubmit={handleCreate}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新增分類名稱"
          className="flex-1 rounded-md border border-brown-300 bg-white px-3 py-2 text-sm text-black-900 outline-none focus:border-blue-700"
        />
        <Button type="submit" disabled={creating || newName.trim() === ''} loading={creating} className="shrink-0">
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
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {(categories ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-black-300">
                  尚無分類
                </td>
              </tr>
            )}
            {(categories ?? []).map((category) => {
              const isEditing = editingId === category.id
              return (
                <tr key={category.id} className="border-b border-brown-300/30 last:border-0">
                  <td className="px-4 py-3 text-black-500">{category.id}</td>
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
                      <span className="text-black-900">{category.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleUpdate(category.id)}
                            disabled={savingId === category.id}
                            className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-spirit-forest disabled:opacity-50"
                          >
                            {savingId === category.id ? '儲存中…' : '儲存'}
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
                            onClick={() => startEdit(category)}
                            className="rounded-md border border-brown-300 px-3 py-1.5 text-xs text-black-700 transition hover:bg-beige-200"
                          >
                            編輯
                          </button>
                          <button
                            onClick={() => handleDelete(category.id)}
                            disabled={deletingId === category.id}
                            className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            {deletingId === category.id ? '刪除中…' : '刪除'}
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
