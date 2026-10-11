'use client'

import { useEffect, useState } from 'react'
import { Coins } from 'lucide-react'
import { apiFetch, LIMIT } from '@/lib/api'
import Pagination from '@/components/Pagination'
import { ButtonLink, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui'
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
      <ErrorState className={styles.content}>
        <p>{error}</p>
        <a href="/" className={styles.loginLink}>
          回首頁登入
        </a>
      </ErrorState>
    )
  }

  const isEmpty = !wallet || wallet.data.length === 0

  return (
    <div className={`${styles.content} pb-page-bottom`}>
      <PageHeader title="積分紀錄" subtitle="查看每一筆積分的獲得明細。" />

      {isEmpty ? (
        <EmptyState>
          <p>尚無積分紀錄</p>
          <ButtonLink href="/adaptive">
            開始智慧練習
          </ButtonLink>
        </EmptyState>
      ) : (
        <>
          <div className={styles.transactionList}>
            {wallet.data.map((item) => (
              <TransactionRow key={item.id} item={item} />
            ))}
          </div>

          <Pagination
            page={page}
            totalPages={wallet.paginate.totalPages}
            onChange={fetchPage}
            disabled={loading}
            className="mt-6"
          />
        </>
      )}
    </div>
  )
}
