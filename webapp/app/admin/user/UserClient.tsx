'use client'

import { useEffect, useState } from 'react'
import { ApiError, apiFetch, apiPut, LIMIT } from '@/lib/api'
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
  /** Spendable balance. */
  totalPoints: number
  /** Only ever increases; what the leaderboard ranks on. */
  lifetimePoints: number
}

type PointsAdjustResponse = { totalPoints: number; lifetimePoints: number; delta: number }

// A testing affordance, so the amounts are the ones worth typing once:
// enough to redeem something, and enough to not bother again for a while.
const PRESET_AMOUNTS = [100, 1000]

type SortColumn = 'id' | 'email' | 'name' | 'lastLoginAt'

const formatDateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString('zh-TW') : '-'

export default function UserClient() {
  const [users, setUsers] = useState<UserDto[] | null>(null)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  // One amount for the whole table rather than an input per row: the
  // admin picks a size once and then clicks +/- on whichever users they
  // are setting up, which is the actual workflow.
  const [adjustAmount, setAdjustAmount] = useState(100)
  const [adjustingId, setAdjustingId] = useState<number | null>(null)
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

  /**
   * Moves one user's balance by `delta`.
   *
   * Patches the row from the response for the same reason
   * toggleSubscription does -- but here it matters more, because the
   * reply is the only place the new balance is reported, and the two
   * figures move differently: a credit raises both, a debit only the
   * spendable one.
   */
  const adjustPoints = async (user: UserDto, delta: number) => {
    setAdjustingId(user.id)
    setError(null)
    try {
      const next = await apiPut<PointsAdjustResponse>(`user/${user.id}/points`, { delta })
      setUsers((prev) =>
        (prev ?? []).map((u) =>
          u.id === user.id
            ? { ...u, totalPoints: next.totalPoints, lifetimePoints: next.lifetimePoints }
            : u
        )
      )
    } catch (e) {
      // The one failure that is routine rather than exceptional: the
      // column is unsigned, so a debit cannot take a balance below zero.
      const who = user.email ?? user.id
      setError(
        e instanceof ApiError && e.code === 'INSUFFICIENT_POINTS'
          ? `${who} 目前只有 ${user.totalPoints} 點，不能扣 ${Math.abs(delta)} 點。`
          : `無法調整 ${who} 的點數。`
      )
    } finally {
      setAdjustingId(null)
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
              <th className="px-4 py-3">
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span>點數</span>
                  <input
                    type="number"
                    min={1}
                    max={1000000}
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(Number(e.target.value))}
                    className="w-20 rounded-md border border-brown-300 px-2 py-1 text-xs font-normal tabular-nums"
                    aria-label="調整點數的數量"
                  />
                  {PRESET_AMOUNTS.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setAdjustAmount(amount)}
                      className="rounded border border-brown-300 px-1.5 py-0.5 text-[11px] font-normal text-black-500 transition hover:bg-beige-200"
                    >
                      {amount}
                    </button>
                  ))}
                </div>
              </th>
              <SortableTh label="最後登入時間" column="lastLoginAt" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {(users ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-black-300">
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
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <span className="tabular-nums font-bold text-black-900">
                      {user.totalPoints.toLocaleString('zh-TW')}
                    </span>
                    {/* Shown because a credit moves it and a debit does
                        not, which is otherwise invisible and surprising. */}
                    <span className="text-[11px] text-black-300 tabular-nums">
                      累計 {user.lifetimePoints.toLocaleString('zh-TW')}
                    </span>
                    <button
                      type="button"
                      onClick={() => adjustPoints(user, adjustAmount)}
                      disabled={adjustingId === user.id || adjustAmount < 1}
                      className="rounded-md border border-brown-300 px-2 py-1 text-xs text-black-700 transition hover:bg-beige-200 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`為 ${user.email ?? user.id} 增加 ${adjustAmount} 點`}
                    >
                      ＋
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustPoints(user, -adjustAmount)}
                      disabled={
                        adjustingId === user.id ||
                        adjustAmount < 1 ||
                        user.totalPoints < adjustAmount
                      }
                      className="rounded-md border border-brown-300 px-2 py-1 text-xs text-black-700 transition hover:bg-beige-200 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`為 ${user.email ?? user.id} 扣除 ${adjustAmount} 點`}
                    >
                      －
                    </button>
                    {adjustingId === user.id && (
                      <span className="text-[11px] text-black-300">處理中…</span>
                    )}
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
