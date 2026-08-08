'use client'

import { useEffect, useState } from 'react'
import { Coins } from 'lucide-react'
import { apiFetch, LIMIT } from '@/lib/api'
import type { GetWalletResponse, PointTransaction } from '@/types/api'

const typeLabel: Record<string, string> = {
  EARN_REPLY: '答題獲得',
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function TransactionRow({ item }: { item: PointTransaction }) {
  const positive = item.amount >= 0
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-brown-300 bg-white/60 px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-700/10 text-amber-700">
          <Coins size={18} strokeWidth={2} />
        </span>
        <div>
          <p className="text-sm font-medium text-black-900">{typeLabel[item.type] ?? item.type}</p>
          <p className="text-xs text-black-500">{formatDate(item.createdAt)}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-base font-bold ${positive ? 'text-green-700' : 'text-orange-700'}`}>
          {positive ? '+' : ''}
          {item.amount}
        </p>
        <p className="text-xs text-black-500">餘額 {item.balanceAfter}</p>
      </div>
    </div>
  )
}

export default function WalletClient() {
  const [wallet, setWallet] = useState<GetWalletResponse | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = async (p: number) => {
    setLoading(true)
    try {
      const data = await apiFetch<GetWalletResponse>('wallet', {
        offset: p > 1 ? (p - 1) * LIMIT : undefined,
        limit: LIMIT,
      })
      setWallet(data)
      setPage(p)
    } catch {
      setError('無法載入積分紀錄，請確認已登入。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading && !wallet) {
    return (
      <div className="flex h-48 items-center justify-center">
        <span className="text-sm text-black-500">載入中…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-[24px] border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <a href="/" className="mt-4 inline-block text-sm text-blue-700 underline hover:text-[#1f3ea3]">
          回首頁登入
        </a>
      </div>
    )
  }

  const isEmpty = !wallet || wallet.data.length === 0

  return (
    <div className="pb-[70px]">
      <h1 className="mt-[60px] mb-2 text-3xl font-bold text-blue-700">積分紀錄</h1>
      <p className="mb-10 text-sm text-black-500">查看每一筆積分的獲得明細。</p>

      {isEmpty ? (
        <div className="rounded-[24px] border border-brown-300 bg-white p-8 text-center">
          <p className="text-sm text-black-500">尚無積分紀錄</p>
          <a
            href="/adaptive"
            className="mt-4 inline-block rounded-md bg-blue-700 px-6 py-2.5 text-sm font-bold text-white hover:bg-[#1f3ea3]"
          >
            開始智慧練習
          </a>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {wallet.data.map((item) => (
              <TransactionRow key={item.id} item={item} />
            ))}
          </div>

          {wallet.paginate.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={() => fetchPage(page - 1)}
                disabled={page === 1 || loading}
                className="rounded-md border border-brown-300 px-4 py-2 text-sm disabled:opacity-40"
              >
                ← 上一頁
              </button>
              <span className="text-sm text-black-500">
                第 {page} / {wallet.paginate.totalPages} 頁
              </span>
              <button
                onClick={() => fetchPage(page + 1)}
                disabled={page === wallet.paginate.totalPages || loading}
                className="rounded-md border border-brown-300 px-4 py-2 text-sm disabled:opacity-40"
              >
                下一頁 →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
