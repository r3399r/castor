'use client'

import { useEffect, useState } from 'react'
import { Coins } from 'lucide-react'
import { apiFetch, LIMIT } from '@/lib/api'
import { LoadingState } from '@/components/ui'
import type { GetWalletResponse, PointTransaction } from '@/types/api'
import styles from '../user.module.css'

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
    <div className={styles.transactionRow}>
      <div className="flex items-center gap-3">
        <span className={styles.transactionIcon}>
          <Coins size={18} strokeWidth={2} />
        </span>
        <div>
          <p className={styles.transactionTitle}>{typeLabel[item.type] ?? item.type}</p>
          <p className={styles.transactionMeta}>{formatDate(item.createdAt)}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-base font-bold ${positive ? styles.amountPositive : styles.amountNegative}`}>
          {positive ? '+' : ''}
          {item.amount}
        </p>
        <p className={styles.transactionMeta}>餘額 {item.balanceAfter}</p>
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
    return <LoadingState />
  }

  if (error) {
    return (
      <div className={`${styles.content} ${styles.errorState}`}>
        <p className={styles.errorText}>{error}</p>
        <a href="/" className={`${styles.loginLink} mt-4 inline-block`}>
          回首頁登入
        </a>
      </div>
    )
  }

  const isEmpty = !wallet || wallet.data.length === 0

  return (
    <div className={`${styles.content} pb-[70px]`}>
      <h1 className={styles.title}>積分紀錄</h1>
      <p className={styles.subtitle}>查看每一筆積分的獲得明細。</p>

      {isEmpty ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>尚無積分紀錄</p>
          <a
            href="/adaptive"
            className={`${styles.primaryButton} mt-4 inline-flex`}
          >
            開始智慧練習
          </a>
        </div>
      ) : (
        <>
          <div className={styles.transactionList}>
            {wallet.data.map((item) => (
              <TransactionRow key={item.id} item={item} />
            ))}
          </div>

          {wallet.paginate.totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                onClick={() => fetchPage(page - 1)}
                disabled={page === 1 || loading}
                className={styles.paginationButton}
              >
                ← 上一頁
              </button>
              <span className={styles.paginationText}>
                第 {page} / {wallet.paginate.totalPages} 頁
              </span>
              <button
                onClick={() => fetchPage(page + 1)}
                disabled={page === wallet.paginate.totalPages || loading}
                className={styles.paginationButton}
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
