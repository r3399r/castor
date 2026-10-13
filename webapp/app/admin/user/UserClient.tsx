'use client'

import { useEffect, useState } from 'react'
import { apiFetch, apiPut, LIMIT } from '@/lib/api'
import Pagination from '@/components/Pagination'
import { ErrorState, LoadingState, PageHeader, TableFrame } from '@/components/ui'
import SortableTh, { type SortDirection } from '@/components/SortableTh'
import type { Paginate } from '@/types/api'

type SubscriptionStatus = { active: boolean; plan: string | null; expiresAt: string | null }

type UserDto = {
  id: number
  email: string | null
  name: string | null
  avatar: string | null
  lastLoginAt: string | null
  subscription: SubscriptionStatus
}

type SortColumn = 'id' | 'email' | 'name' | 'lastLoginAt'

const formatDateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString('zh-TW') : '-'

export default function UserClient() {
  const [users, setUsers] = useState<UserDto[] | null>(null)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sortColumn, setSortColumn] = useState<SortColumn>('id')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // Patches the one row in place rather than refetching the page: a
  // reload would lose the admin's scroll position and re-sort, and the
  // response already says what the new state is.
  const toggleSubscription = async (user: UserDto) => {
    setTogglingId(user.id)
    setError(null)
    try {
      const next = await apiPut<SubscriptionStatus>(`user/${user.id}/subscription`, {
        active: !user.subscription.active,
      })
      setUsers((prev) =>
        (prev ?? []).map((u) => (u.id === user.id ? { ...u, subscription: next } : u))
      )
    } catch {
      setError(`無法切換 ${user.email ?? user.id} 的訂閱狀態。`)
    } finally {
      setTogglingId(null)
    }
  }

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
    return <LoadingState />
  }

  if (error) {
    return <ErrorState>{error}</ErrorState>
  }

  return (
    <div className="pb-page-bottom">
      <PageHeader title="使用者管理" />

      <TableFrame className="mt-4">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-brown-300/60 text-xs font-medium text-black-700">
              <SortableTh label="ID" column="id" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <SortableTh label="Email" column="email" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <SortableTh label="名稱" column="name" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <th className="px-4 py-3">大頭貼</th>
              <th className="px-4 py-3">訂閱</th>
              <SortableTh label="最後登入時間" column="lastLoginAt" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {(users ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-black-300">
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
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        user.subscription.active
                          ? 'bg-[#E8F1EA] text-[#2F6B4F]'
                          : 'bg-beige-200 text-black-500'
                      }`}
                    >
                      {user.subscription.active ? '訂閱中' : '未訂閱'}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleSubscription(user)}
                      disabled={togglingId === user.id}
                      className="rounded-md border border-brown-300 px-3 py-1.5 text-xs text-black-700 transition hover:bg-beige-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {togglingId === user.id
                        ? '處理中…'
                        : user.subscription.active
                          ? '取消訂閱'
                          : '開通訂閱'}
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-black-500">{formatDateTime(user.lastLoginAt)}</td>
              </tr>
            ))}
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
