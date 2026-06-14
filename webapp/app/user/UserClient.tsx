'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
  const [tooltip, setTooltip] = useState<{
    pct: number
    date: string
    values: { name: string; mastery: number | null; color: string }[]
  } | null>(null)

  const nonEmpty = series.filter((s) => s.data.length > 0)

  if (nonEmpty.length === 0)
    return (
      <div className="flex h-40 items-center justify-center text-sm text-black-300">
        尚無資料
      </div>
    )

  const W = 600, H = 160, padL = 28, padR = 8, padT = 8, padB = 20
  const chartW = W - padL - padR
  const chartH = H - padT - padB

  const allDatesSet = new Set<string>()
  nonEmpty.forEach((s) => s.data.forEach((d) => allDatesSet.add(d.date)))
  const allDates = [...allDatesSet].sort()

  const timestamps = allDates.map((d) => new Date(d + 'T00:00:00').getTime())
  const minDate = Math.min(...timestamps)
  const maxDate = Math.max(...timestamps)
  const dateRange = maxDate - minDate || 1

  const toX = (dateStr: string) =>
    padL + ((new Date(dateStr + 'T00:00:00').getTime() - minDate) / dateRange) * chartW
  const toY = (mastery: number) => padT + chartH - (mastery / 10) * chartH

  const seriesLookup = nonEmpty.map(
    (s) => new Map(s.data.map((d) => [d.date, d.weightedMastery]))
  )

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const chartX = ((e.clientX - rect.left) / rect.width) * W - padL
    if (chartX < 0 || chartX > chartW) { setTooltip(null); return }

    const t = minDate + (chartX / chartW) * dateRange
    const nearestDate = allDates.reduce((best, d) => {
      const dt = new Date(d + 'T00:00:00').getTime()
      const bt = new Date(best + 'T00:00:00').getTime()
      return Math.abs(dt - t) < Math.abs(bt - t) ? d : best
    })

    const pct = (toX(nearestDate) - padL) / chartW
    setTooltip({
      pct,
      date: nearestDate,
      values: nonEmpty.map((s, i) => ({
        name: s.name,
        color: s.color,
        mastery: seriesLookup[i].get(nearestDate) ?? null,
      })),
    })
  }

  const crosshairX = tooltip !== null ? padL + tooltip.pct * chartW : null

  const xLabelDates = [
    allDates[0],
    allDates[Math.floor(allDates.length / 2)],
    allDates[allDates.length - 1],
  ].filter((d, i, arr) => d && arr.indexOf(d) === i)

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Grid */}
        {[0, 2, 4, 6, 8, 10].map((v) => (
          <line key={v} x1={padL} y1={toY(v)} x2={W - padR} y2={toY(v)} stroke="#E5E0DC" strokeWidth={0.5} />
        ))}
        {[0, 5, 10].map((v) => (
          <text key={v} x={padL - 4} y={toY(v) + 4} textAnchor="end" fontSize={8} fill="#9b9186">{v}</text>
        ))}

        {/* Lines */}
        {nonEmpty.map((s) =>
          s.data.length < 2 ? null : (
            <polyline
              key={s.name}
              points={s.data.map((d) => `${toX(d.date)},${toY(d.weightedMastery)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeOpacity={tooltip ? 0.3 : 1}
            />
          )
        )}

        {/* Data point dots */}
        {nonEmpty.map((s) =>
          s.data.map((d) => (
            <circle
              key={`${s.name}-${d.date}`}
              cx={toX(d.date)}
              cy={toY(d.weightedMastery)}
              r={2}
              fill={s.color}
              fillOpacity={tooltip ? 0.2 : 0.85}
            />
          ))
        )}

        {/* Crosshair */}
        {crosshairX !== null && (
          <line x1={crosshairX} y1={padT} x2={crosshairX} y2={H - padB}
            stroke="#9b9186" strokeWidth={1} strokeDasharray="4,2" />
        )}

        {/* Highlighted dots */}
        {tooltip &&
          nonEmpty.map((s, i) => {
            const m = seriesLookup[i].get(tooltip.date)
            return m != null ? (
              <circle key={s.name} cx={crosshairX!} cy={toY(m)} r={3.5}
                fill={s.color} stroke="white" strokeWidth={1.5} />
            ) : null
          })}

        {/* X labels */}
        {xLabelDates.map((d) => (
          <text key={d} x={toX(d)} y={H - 4} textAnchor="middle" fontSize={8} fill="#9b9186">
            {d.slice(5)}
          </text>
        ))}
      </svg>

      {/* Tooltip */}
      {tooltip && tooltip.values.some((v) => v.mastery !== null) && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-[120px]"
          style={{
            left: `${tooltip.pct * 100}%`,
            transform: tooltip.pct > 0.65 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)',
          }}
        >
          <div className="rounded-lg border border-brown-300 bg-white px-3 py-2 shadow-md">
            <div className="mb-1.5 text-[10px] font-medium text-black-500">{tooltip.date}</div>
            {tooltip.values
              .filter((v) => v.mastery !== null)
              .map((v) => (
                <div key={v.name} className="flex items-center gap-1.5 text-[11px]">
                  <span style={{ color: v.color }}>●</span>
                  <span className="text-black-500 truncate">{v.name}</span>
                  <span className="ml-auto pl-2 font-medium text-black-900">
                    {v.mastery!.toFixed(2)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {nonEmpty.map((s) => (
          <div key={s.name} className="flex items-center gap-1.5">
            <span style={{ width: 16, height: 2, backgroundColor: s.color, display: 'inline-block', borderRadius: 1 }} />
            <span className="text-[10px] text-black-500">{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Learning Heatmap ─────────────────────────────────────────────────────────

function heatColor(count: number): string {
  if (count === 0) return '#EBEDF0'
  if (count <= 2) return '#9BE9A8'
  if (count <= 5) return '#40C463'
  if (count <= 9) return '#30A14E'
  return '#216E39'
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_LABELS = ['日', '', '二', '', '四', '', '六']

// All sizing in px — keep consistent so month labels align with week columns
const CELL = 11
const GAP = 2
const WEEK_W = CELL + GAP  // 13 px per week column (cell + right gap)
const DAY_W = 18            // day-label column width (includes its right gap)

function LearningHeatmap({
  activityMap,
}: {
  activityMap: { date: string; count: number }[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{
    date: string
    count: number
    x: number
    y: number
  } | null>(null)

  const countByDate = useMemo(
    () => new Map(activityMap.map((a) => [a.date, a.count])),
    [activityMap]
  )

  const handleCellEnter = (e: React.MouseEvent<HTMLDivElement>, date: string, count: number) => {
    if (!containerRef.current) return
    const cr = containerRef.current.getBoundingClientRect()
    const tr = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTooltip({ date, count, x: tr.left - cr.left + tr.width / 2, y: tr.top - cr.top })
  }

  // Generate last 365 days
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const allDays: string[] = []
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    allDays.push(toDateString(d))
  }

  // Pad start to align with Sunday (day 0)
  const firstDayOfWeek = new Date(allDays[0] + 'T00:00:00').getDay()
  const padded: (string | null)[] = [
    ...Array<null>(firstDayOfWeek).fill(null),
    ...allDays,
  ]

  // Chunk into weeks of 7
  const weeks: (string | null)[][] = []
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7).concat(Array(7).fill(null)).slice(0, 7))
  }

  // Month labels: record week index where month first appears
  const monthLabels: { weekIdx: number; month: string }[] = []
  let lastMonth = -1
  weeks.forEach((week, wi) => {
    const first = week.find((d) => d !== null)
    if (!first) return
    const m = new Date(first + 'T00:00:00').getMonth()
    if (m !== lastMonth) {
      monthLabels.push({ weekIdx: wi, month: MONTH_NAMES[m] })
      lastMonth = m
    }
  })

  return (
    <div className="relative overflow-x-auto" ref={containerRef}>
      <div style={{ width: DAY_W + weeks.length * WEEK_W }}>
        {/* Month labels — paddingLeft = DAY_W, each slot = WEEK_W → exact column alignment */}
        <div className="mb-1 flex" style={{ paddingLeft: DAY_W }}>
          {weeks.map((_, wi) => {
            const label = monthLabels.find((ml) => ml.weekIdx === wi)
            return (
              <div key={wi} style={{ width: WEEK_W, flexShrink: 0, fontSize: 9, color: '#9b9186' }}>
                {label?.month ?? ''}
              </div>
            )
          })}
        </div>

        {/* Grid row: day-label column + week columns */}
        <div style={{ display: 'flex' }}>
          {/* Day labels */}
          <div style={{ width: DAY_W, flexShrink: 0 }}>
            {DAY_LABELS.map((label, i) => (
              <div
                key={i}
                style={{
                  height: CELL,
                  marginBottom: i < 6 ? GAP : 0,
                  fontSize: 8,
                  lineHeight: `${CELL}px`,
                  color: '#9b9186',
                  textAlign: 'right',
                  paddingRight: 4,
                }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Week columns */}
          {weeks.map((week, wi) => (
            <div key={wi} style={{ width: WEEK_W, flexShrink: 0 }}>
              {week.map((day, di) => (
                <div
                  key={di}
                  onMouseEnter={day ? (e) => handleCellEnter(e, day, countByDate.get(day) ?? 0) : undefined}
                  onMouseLeave={() => setTooltip(null)}
                  style={{
                    width: CELL,
                    height: CELL,
                    marginBottom: di < 6 ? GAP : 0,
                    borderRadius: 2,
                    backgroundColor: day ? heatColor(countByDate.get(day) ?? 0) : 'transparent',
                    cursor: day ? 'default' : undefined,
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[9px] text-black-300">少</span>
          {[0, 2, 5, 9, 10].map((v) => (
            <div
              key={v}
              style={{ width: CELL, height: CELL, borderRadius: 2, backgroundColor: heatColor(v) }}
            />
          ))}
          <span className="text-[9px] text-black-300">多</span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap"
          style={{ left: tooltip.x, top: tooltip.y - 6, transform: 'translate(-50%, -100%)' }}
        >
          <div className="rounded-md border border-brown-300 bg-white px-2 py-1 shadow-sm text-[11px]">
            <span className="text-black-500">{tooltip.date}</span>
            <span className="ml-2 font-medium text-blue-700">{tooltip.count} 題</span>
          </div>
          <div className="mx-auto mt-0.5 h-1.5 w-1.5 rotate-45 border-b border-r border-brown-300 bg-white" />
        </div>
      )}
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
