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
import Chip from '@/components/Chip'
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
  tone = 'blue',
}: {
  label: string
  value: string | number
  sub?: string
  tone?: 'blue' | 'orange' | 'green'
}) {
  const toneClass = {
    blue: 'border-blue-700/40 bg-blue-700/15 text-blue-700',
    orange: 'border-orange-700/40 bg-orange-700/10 text-orange-700',
    green: 'border-green-700/40 bg-green-700/10 text-green-700',
  }[tone]
  const percentValue = typeof value === 'string' && value.endsWith('%')

  return (
    <div className={`flex flex-col gap-2 rounded-lg border p-5 ${toneClass}`}>
      <span className="text-sm font-medium text-black-700">{label}</span>
      <span className="text-4xl font-bold">
        {percentValue ? (
          <>
            {value.slice(0, -1)}
            <span className="ml-0.5 align-baseline text-base">%</span>
          </>
        ) : (
          value
        )}
      </span>
      {sub && <span className="text-xs text-black-500">{sub}</span>}
    </div>
  )
}

// ─── Progress Chart ───────────────────────────────────────────────────────────

const DATE_RANGES = [
  { label: '30天', days: 30 },
  { label: '90天', days: 90 },
  { label: '全部', days: 0 },
]

const SERIES_COLORS = ['#5D7ED8', '#C0266A', '#16A34A', '#F97316', '#7C4DCC', '#D14F8F', '#1C9AA5']

type ChartSeries = {
  name: string
  color: string
  data: DailyMastery[]
}

function ChartLegend({
  items,
  hiddenSeries,
  onToggle,
}: {
  items: ChartSeries[]
  hiddenSeries: Set<string>
  onToggle: (name: string) => void
}) {
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 px-1">
      {items.map((s) => (
        <button
          key={s.name}
          onClick={() => onToggle(s.name)}
          className="flex items-center gap-1.5"
          style={{ opacity: hiddenSeries.has(s.name) ? 0.3 : 1 }}
        >
          <svg width="16" height="3" style={{ display: 'block', flexShrink: 0 }}>
            <line x1="0" y1="1.5" x2="16" y2="1.5" stroke={s.color} strokeWidth="2" />
          </svg>
          <span className="text-[11px] text-black-700">{s.name}</span>
        </button>
      ))}
    </div>
  )
}

function ProgressChart({ series, toggleable = false }: { series: ChartSeries[]; toggleable?: boolean }) {
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set())

  useEffect(() => {
    setHiddenSeries(new Set())
  }, [series])

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

  const toggle = (name: string) =>
    setHiddenSeries((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
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
        {toggleable ? (
          <Legend content={() => <ChartLegend items={nonEmpty} hiddenSeries={hiddenSeries} onToggle={toggle} />} />
        ) : (
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
        )}
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
            hide={toggleable ? hiddenSeries.has(s.name) : false}
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
    <div className="h-2.5 flex-1 overflow-hidden rounded-[2px] bg-[#E5E0DC]">
      <div
        className="h-full rounded-[2px] bg-blue-500 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function SubjectCard({ stat }: { stat: StatsSubject }) {
  const totalQ = stat.conceptGroup.reduce((sum, cg) => sum + cg.numberOfQuestions, 0)
  const avgMastery =
    totalQ > 0
      ? stat.conceptGroup.reduce((sum, cg) => sum + cg.mastery * cg.numberOfQuestions, 0) / totalQ
      : 0

  return (
    <div className="rounded-lg border border-brown-300 bg-white/40 p-6 pt-4 pb-8">
      <div className="mb-4">
        <div className="mb-3 flex flex-wrap gap-1.5">
            {stat.category.map((c) => (
              <Chip key={c.id} label={c.name} color="bg-orange-700/15 text-orange-800" />
            ))}
        </div>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-bold text-black-500">{stat.name}</h2>
          {stat.conceptGroup.length > 0 && (
            <span className="shrink-0 text-xs text-black-500">
              平均{' '}
              <span className="text-base font-bold text-blue-700">
                {avgMastery.toFixed(2)}
              </span>{' '}
              / 10
            </span>
          )}
        </div>
      </div>
      {stat.conceptGroup.length === 0 ? (
        <p className="text-sm text-black-200">尚無觀念熟練度資料</p>
      ) : (
        <div className="flex flex-col gap-3 border-t border-brown-300/60 pt-4">
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 text-xs font-medium text-black-700">
            <span>觀念</span>
            <span className="text-right">熟練度 / 10</span>
          </div>
          {stat.conceptGroup.map((cg) => (
            <div key={cg.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1">
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

const VIEW_MODES = [
  { label: '整體', value: 'overall' as const },
  { label: '各科', value: 'subjects' as const },
]

function HistorySection({ history }: { history: GetUserHistoryResponse }) {
  const [rangeDays, setRangeDays] = useState(90)
  const [viewMode, setViewMode] = useState<'overall' | 'subjects'>('overall')

  const series = useMemo<ChartSeries[]>(() => {
    const filter = (data: DailyMastery[]) => {
      if (rangeDays === 0) return data
      const cutoff = cutoffDate(rangeDays)
      return data.filter((d) => d.date >= cutoff)
    }
    const overall: ChartSeries = { name: '整體', color: SERIES_COLORS[0], data: filter(history.overallDailyMastery) }
    const subjects: ChartSeries[] = history.subjectHistory.map((s, i) => ({
      name: s.subjectName,
      color: SERIES_COLORS[(i + 1) % SERIES_COLORS.length],
      data: filter(s.dailyStats),
    }))
    return viewMode === 'overall' ? [overall] : subjects
  }, [history, rangeDays, viewMode])

  function TabGroup<T extends string | number>({
    options,
    value,
    onChange,
  }: {
    options: { label: string; value: T }[]
    value: T
    onChange: (v: T) => void
  }) {
    return (
      <div className="flex overflow-hidden rounded-md border border-brown-300 divide-x divide-brown-300/50">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`px-3 py-1 text-xs transition-colors ${
              value === o.value
                ? 'bg-beige-300 text-brown-900'
                : 'bg-beige-100 text-black-700 hover:bg-beige-200'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="mb-8 flex flex-col gap-6">
      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="總刷題數" value={history.totalAttempts} sub="題" tone="blue" />
        <StatCard
          label="總得分率"
          value={`${Math.round(history.overallAccuracy)}%`}
          sub="平均正確率"
          tone="orange"
        />
        <StatCard label="連續天數" value={history.streakDays} sub="天" tone="green" />
      </div>

      {/* Progress curve */}
      <div className="rounded-lg border border-brown-300 bg-white/40 p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-black-500">進步曲線</h2>
          <div className="flex items-center gap-2">
            <TabGroup options={VIEW_MODES} value={viewMode} onChange={setViewMode} />
            <TabGroup<number> options={DATE_RANGES.map(r => ({ label: r.label, value: r.days }))} value={rangeDays} onChange={setRangeDays} />
          </div>
        </div>
        <ProgressChart series={series} toggleable={viewMode === 'subjects'} />
        <p className="mt-1 text-right text-[10px] text-black-300">熟練度 0–10</p>
      </div>

      {/* Learning heatmap */}
      <div className="rounded-lg border border-brown-300 bg-white/40 p-6">
        <h2 className="mb-4 text-base font-bold text-black-500">學習熱點圖</h2>
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
    <div className="pb-[70px]">
      <h1 className="mt-[60px] mb-6 text-3xl font-bold text-blue-700">學習分析</h1>

      {history && <HistorySection history={history} />}

      {stats && stats.length > 0 && (
        <>
          <h2 className="mt-12 mb-5 text-xl font-bold text-blue-700">當前熟練度</h2>
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
