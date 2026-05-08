'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import type { GetUserStatsResponse, UserSubjectStat } from '@/types/api'

function MasteryBar({ value, max = 10 }: { value: number; max?: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#E5E0DC]">
      <div
        className="h-full rounded-full bg-[#2547C5] transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function SubjectCard({ stat }: { stat: UserSubjectStat }) {
  return (
    <div className="rounded-[24px] border border-[#C5B3A7] bg-white p-6">
      <div className="mb-1 text-xs font-medium text-[#625D5A]">
        {stat.category.map((c) => c.name).join('・')}
      </div>
      <h2 className="mb-4 text-lg font-bold text-[#2547C5]">{stat.name}</h2>

      {stat.conceptGroup.length === 0 ? (
        <p className="text-sm text-[#B2ADAA]">尚無觀念熟練度資料</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 text-xs font-medium text-[#4E4946]">
            <span>觀念</span>
            <span className="text-right">熟練度 / 10</span>
          </div>
          {stat.conceptGroup.map((cg) => (
            <div key={cg.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4">
              <span className="truncate text-sm text-[#302B28]">{cg.name}</span>
              <span className="text-right text-sm font-medium text-[#2547C5]">{Math.round(cg.mastery * 100) / 100}</span>
              <div className="col-span-2">
                <MasteryBar value={cg.mastery} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function UserClient() {
  const [stats, setStats] = useState<GetUserStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<GetUserStatsResponse>('user/stats')
      .then(setStats)
      .catch(() => setError('無法載入學習資料，請確認已登入。'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <span className="text-sm text-[#625D5A]">載入中…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-[24px] border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <a
          href="/"
          className="mt-4 inline-block text-sm text-[#2547C5] underline hover:text-[#1f3ea3]"
        >
          回首頁登入
        </a>
      </div>
    )
  }

  if (!stats || stats.length === 0) {
    return (
      <div className="rounded-[24px] border border-[#C5B3A7] bg-white p-8 text-center">
        <p className="text-sm text-[#625D5A]">尚無學習資料，先去練習幾題吧！</p>
        <a
          href="/question"
          className="mt-4 inline-block rounded-md bg-[#2547C5] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#1f3ea3]"
        >
          前往題庫
        </a>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-[#2547C5]">學習分析</h1>
      <div className="grid gap-6 md:grid-cols-2">
        {stats.map((stat) => (
          <SubjectCard key={stat.id} stat={stat} />
        ))}
      </div>
    </div>
  )
}
