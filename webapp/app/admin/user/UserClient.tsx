'use client'

import { useEffect, useState } from 'react'
import { apiFetch, LIMIT } from '@/lib/api'
import Pagination from '@/components/Pagination'
import SortableTh, { type SortDirection } from '@/components/SortableTh'
import type { Paginate } from '@/types/api'

type UserDto = {
  id: number
  email: string | null
  name: string | null
  avatar: string | null
  lastLoginAt: string | null
}

type SortColumn = 'id' | 'email' | 'name' | 'lastLoginAt'

const formatDateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString('zh-TW') : '-'

export default function UserClient() {
  const [users, setUsers] = useState<UserDto[] | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sortColumn, setSortColumn] = useState<SortColumn>('id')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const load = async (
    targetPage: number,
    sort: SortColumn,
    order: SortDirection
  ) => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<Paginate<UserDto>>('user', {
        limit: LIMIT,
        offset: (targetPage - 1) * LIMIT,
        sort,
        order,
      })
      setUsers(res.data)
      setTotalPages(res.paginate.totalPages)
      setPage(targetPage)
    } catch {
      setError('無法載入使用者列表。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(1, sortColumn, sortDirection)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSort = (column: SortColumn) => {
    const direction =
      column === sortColumn ? (sortDirection === 'asc' ? 'desc' : 'asc') : 'asc'
    setSortColumn(column)
    setSortDirection(direction)
    load(1, column, direction)
  }

  if (loading && users === null) {
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
      <h1 className="mt-[60px] mb-6 text-3xl font-bold text-blue-700">使用者管理</h1>

      <div className="mt-4 overflow-x-auto rounded-lg border border-brown-300 bg-white/40">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-brown-300/60 text-xs font-medium text-black-700">
              <SortableTh label="ID" column="id" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <SortableTh label="Email" column="email" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <SortableTh label="名稱" column="name" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <th className="px-4 py-3">大頭貼</th>
              <SortableTh label="最後登入時間" column="lastLoginAt" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {(users ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-black-300">
                  尚無使用者
                </td>
              </tr>
            )}
            {(users ?? []).map((user) => (
              <tr key={user.id} className="border-b border-brown-300/30 last:border-0">
                <td className="px-4 py-3 text-black-500">{user.id}</td>
                <td className="px-4 py-3 text-black-900">{user.email ?? '-'}</td>
                <td className="px-4 py-3 text-black-900">{user.name ?? '-'}</td>
                <td className="px-4 py-3">
                  {user.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.avatar}
                      alt={user.name ?? 'avatar'}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-black-300">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-black-500">{formatDateTime(user.lastLoginAt)}</td>
              </tr>
            ))}
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
