'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ActivityCalendar } from 'react-activity-calendar'
import { apiFetch } from '@/lib/api'
import type {
  DailyMastery,
  GetUserHistoryResponse,
  GetUserStatsResponse,
  StatsSubject,
} from '@/types/api'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function cutoffDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days + 1)
  return toDateString(d)
}

// ─── Stats Cards ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="flex flex-col gap-1 rounded-[20px] border border-brown-300 bg-white p-5">
      <span className="text-xs font-medium text-black-500">{label}</span>
      <span className="text-2xl font-bold text-blue-700">{value}</span>
      {sub && <span className="text-xs text-black-300">{sub}</span>}
    </div>
  )
}

// ─── Progress Chart ───────────────────────────────────────────────────────────

const DATE_RANGES = [
  { label: '30天', days: 30 },
  { label: '90天', days: 90 },
  { label: '全部', days: 0 },
]

const SERIES_COLORS = ['#1d4ed8', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#0891b2']

type ChartSeries = {
  name: string
  color: string
  data: DailyMastery[]
}

function ProgressChart({ series }: { series: ChartSeries[] }) {
  const nonEmpty = series.filter((s) => s.data.length > 0)

  if (nonEmpty.length === 0)
    return (
      <div className="flex h-40 items-center justify-center text-sm text-black-300">
        尚無資料
      </div>
    )

  const allDatesSet = new Set<string>()
  nonEmpty.forEach((s) => s.data.forEach((d) => allDatesSet.add(d.date)))
  const allDates = [...allDatesSet].sort()

  const chartData = allDates.map((date) => {
    const entry: Record<string, string | number | null> = { date: date.slice(5) }
    for (const s of nonEmpty)
      entry[s.name] = s.data.find((d) => d.date === date)?.weightedMastery ?? null
    return entry
  })

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E0DC" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9b9186' }} tickLine={false} />
        <YAxis
          domain={[0, 10]}
          tick={{ fontSize: 10, fill: '#9b9186' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{ borderRadius: 12, borderColor: '#E5E0DC', fontSize: 12 }}
          itemStyle={{ padding: '2px 0' }}
          formatter={(value) => (typeof value === 'number' ? value.toFixed(2) : value)}
        />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
        {nonEmpty.map((s) => (
          <Line
            key={s.name}
            type="monotone"
            dataKey={s.name}
            stroke={s.color}
            strokeWidth={2}
            dot={{ r: 2, fill: s.color }}
            activeDot={{ r: 4 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

// ─── Learning Heatmap ─────────────────────────────────────────────────────────

function toLevel(count: number, max: number): number {
  if (count === 0) return 0
  if (count <= Math.ceil(max * 0.25)) return 1
  if (count <= Math.ceil(max * 0.5)) return 2
  if (count <= Math.ceil(max * 0.75)) return 3
  return 4
}

function LearningHeatmap({
  activityMap,
}: {
  activityMap: { date: string; count: number }[]
}) {
  const countByDate = useMemo(
    () => new Map(activityMap.map((a) => [a.date, a.count])),
    [activityMap]
  )

  const maxCount = useMemo(
    () => Math.max(...activityMap.map((a) => a.count), 1),
    [activityMap]
  )

  const calendarData = useMemo(() => {
    const startDate = cutoffDate(365)
    const todayStr = toDateString(new Date())
    const data: { date: string; count: number; level: number }[] = []
    const cur = new Date(startDate + 'T00:00:00')
    const end = new Date(todayStr + 'T00:00:00')
    while (cur <= end) {
      const d = toDateString(cur)
      const count = countByDate.get(d) ?? 0
      data.push({ date: d, count, level: toLevel(count, maxCount) })
      cur.setDate(cur.getDate() + 1)
    }
    return data
  }, [countByDate, maxCount])

  return (
    <div className="overflow-x-auto">
      <ActivityCalendar
        data={calendarData}
        colorScheme="light"
        theme={{ light: ['#EBEDF0', '#9BE9A8', '#40C463', '#30A14E', '#216E39'] }}
        showWeekdayLabels
        blockSize={11}
        blockMargin={2}
        fontSize={11}
        labels={{
          months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
          weekdays: ['日', '一', '二', '三', '四', '五', '六'],
          legend: { less: '少', more: '多' },
          totalCount: '共 {{count}} 筆活動',
        }}
        tooltips={{
          activity: {
            text: (activity) => `${activity.date}：${activity.count} 題`,
          },
        }}
      />
    </div>
  )
}

// ─── Mastery Bar (existing) ───────────────────────────────────────────────────

function MasteryBar({ value, max = 10 }: { value: number; max?: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#E5E0DC]">
      <div
        className="h-full rounded-full bg-blue-700 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function SubjectCard({ stat }: { stat: StatsSubject }) {
  return (
    <div className="rounded-[24px] border border-brown-300 bg-white p-6">
      <div className="mb-1 text-xs font-medium text-black-500">
        {stat.category.map((c) => c.name).join('・')}
      </div>
      <h2 className="mb-4 text-lg font-bold text-blue-700">{stat.name}</h2>
      {stat.conceptGroup.length === 0 ? (
        <p className="text-sm text-black-200">尚無觀念熟練度資料</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 text-xs font-medium text-black-700">
            <span>觀念</span>
            <span className="text-right">熟練度 / 10</span>
          </div>
          {stat.conceptGroup.map((cg) => (
            <div key={cg.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4">
              <span className="truncate text-sm text-black-900">{cg.name}</span>
              <span className="text-right text-sm font-medium text-blue-700">
                {Math.round(cg.mastery * 100) / 100}
              </span>
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

// ─── History Section ──────────────────────────────────────────────────────────

function HistorySection({ history }: { history: GetUserHistoryResponse }) {
  const [rangeDays, setRangeDays] = useState(90)

  const series = useMemo<ChartSeries[]>(() => {
    const filter = (data: DailyMastery[]) => {
      if (rangeDays === 0) return data
      const cutoff = cutoffDate(rangeDays)
      return data.filter((d) => d.date >= cutoff)
    }
    return [
      { name: '整體', color: SERIES_COLORS[0], data: filter(history.overallDailyMastery) },
      ...history.subjectHistory.map((s, i) => ({
        name: s.subjectName,
        color: SERIES_COLORS[(i + 1) % SERIES_COLORS.length],
        data: filter(s.dailyStats),
      })),
    ]
  }, [history, rangeDays])

  return (
    <div className="mb-8 flex flex-col gap-6">
      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="總刷題數" value={history.totalAttempts} sub="題" />
        <StatCard
          label="總得分率"
          value={`${Math.round(history.overallAccuracy)}%`}
          sub="平均正確率"
        />
        <StatCard label="連續天數" value={history.streakDays} sub="天" />
      </div>

      {/* Progress curve */}
      <div className="rounded-[24px] border border-brown-300 bg-white p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-blue-700">進步曲線</h2>
          <div className="flex rounded-md border border-brown-300 overflow-hidden">
            {DATE_RANGES.map(({ label, days }) => (
              <button
                key={days}
                onClick={() => setRangeDays(days)}
                className={`px-3 py-1 text-xs transition-colors ${
                  rangeDays === days
                    ? 'bg-blue-700 text-white'
                    : 'bg-white text-black-700 hover:bg-[#F5F3F0]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <ProgressChart series={series} />
        <p className="mt-1 text-right text-[10px] text-black-300">熟練度 0–10</p>
      </div>

      {/* Learning heatmap */}
      <div className="rounded-[24px] border border-brown-300 bg-white p-6">
        <h2 className="mb-4 text-base font-bold text-blue-700">學習熱點圖</h2>
        <LearningHeatmap activityMap={history.activityMap} />
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UserClient() {
  const [stats, setStats] = useState<GetUserStatsResponse | null>(null)
  const [history, setHistory] = useState<GetUserHistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      apiFetch<GetUserStatsResponse>('user/stats'),
      apiFetch<GetUserHistoryResponse>('user/history'),
    ])
      .then(([s, h]) => {
        setStats(s)
        setHistory(h)
      })
      .catch(() => setError('無法載入學習資料，請確認已登入。'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
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

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-blue-700">學習分析</h1>

      {history && <HistorySection history={history} />}

      {stats && stats.length > 0 && (
        <>
          <h2 className="mb-4 text-base font-bold text-blue-700">當前熟練度</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {stats.map((stat) => (
              <SubjectCard key={stat.id} stat={stat} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
