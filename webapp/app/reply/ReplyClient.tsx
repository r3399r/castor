'use client'

import { useEffect, useState } from 'react'
import { apiFetch, LIMIT } from '@/lib/api'
import type { GetReplyResponse, Reply } from '@/types/api'

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function ReplyRow({ item }: { item: Reply }) {
  const fbPostId = item.parent === null ? item.question.fbPostId : item.parent.fbPostId
  return (
    <div className="rounded-[20px] border border-brown-300 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="text-xs text-black-200">{formatDate(item.createdAt)}</div>
          <div className="font-medium text-black-900">{item.subject.name}</div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div>
            <span className="text-black-500">作答：</span>
            <span className="font-medium text-black-900">{item.repliedAnswer ?? '—'}</span>
          </div>
          <div>
            <span className="text-black-500">得分：</span>
            <span
              className={`font-bold ${item.score > 0 ? 'text-green-600' : 'text-red-500'}`}
            >
              {item.score}
            </span>
          </div>
          {fbPostId && (
            <a
              href={`https://m.facebook.com/${fbPostId.split('_')[0]}/posts/${fbPostId.split('_')[1]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline hover:text-blue-800"
            >
              討論區
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ReplyClient() {
  const [replyList, setReplyList] = useState<GetReplyResponse | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = async (p: number) => {
    setLoading(true)
    try {
      const data = await apiFetch<GetReplyResponse>('reply', {
        offset: p > 1 ? (p - 1) * LIMIT : undefined,
        limit: LIMIT,
      })
      setReplyList(data)
      setPage(p)
    } catch {
      setError('無法載入答題紀錄，請確認已登入。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPage(1)
  }, [])

  if (loading && !replyList) {
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
        <a
          href="/"
          className="mt-4 inline-block text-sm text-blue-700 underline hover:text-[#1f3ea3]"
        >
          回首頁登入
        </a>
      </div>
    )
  }

  if (!replyList || replyList.data.length === 0) {
    return (
      <div className="rounded-[24px] border border-brown-300 bg-white p-8 text-center">
        <p className="text-sm text-black-500">尚無答題紀錄</p>
        <a
          href="/adaptive"
          className="mt-4 inline-block rounded-md bg-blue-700 px-6 py-2.5 text-sm font-bold text-white hover:bg-[#1f3ea3]"
        >
          開始智慧練習
        </a>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-blue-700">作答記錄</h1>

      <div className="flex flex-col gap-3">
        {replyList.data.map((item) => (
          <ReplyRow key={item.id} item={item} />
        ))}
      </div>

      {replyList.paginate.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => fetchPage(page - 1)}
            disabled={page === 1 || loading}
            className="rounded-md border border-brown-300 px-4 py-2 text-sm disabled:opacity-40"
          >
            ← 上一頁
          </button>
          <span className="text-sm text-black-500">
            第 {page} / {replyList.paginate.totalPages} 頁
          </span>
          <button
            onClick={() => fetchPage(page + 1)}
            disabled={page === replyList.paginate.totalPages || loading}
            className="rounded-md border border-brown-300 px-4 py-2 text-sm disabled:opacity-40"
          >
            下一頁 →
          </button>
        </div>
      )}
    </div>
  )
}
