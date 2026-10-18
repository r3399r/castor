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
import { useAuth } from '@/contexts/AuthContext'
import Chip from '@/components/Chip'
import { ButtonLink, LoadingState } from '@/components/ui'
import styles from './analysis.module.css'
import type {
  DailyMastery,
  ForgettingRiskItem,
  GetAnalysisOverviewResponse,
  MasteryProgress,
  SpeedComparison,
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
  unit,
  sub,
  iconSrc,
  tone = 'blue',
}: {
  label: string
  value: string | number
  unit: string
  sub?: string
  iconSrc: string
  tone?: 'blue' | 'orange' | 'green'
}) {
  const toneClass = {
    blue: styles.summaryWheat,
    orange: styles.summaryClay,
    green: styles.summarySage,
  }[tone]
  return (
    <div className={`${styles.summaryCard} ${toneClass}`}>
      <div className={styles.summaryHeading}>
        <span className={styles.summaryLabel}>{label}</span>
      </div>
      <div className={styles.summaryValueRow}>
        <span className={styles.summaryValue}>{value}</span>
        <span className={styles.summaryUnit}>{unit}</span>
      </div>
      <span className={styles.summarySub} aria-hidden={!sub}>{sub ?? ''}</span>
      <img className={styles.summaryIcon} src={iconSrc} alt="" />
    </div>
  )
}

// ─── Progress Chart ───────────────────────────────────────────────────────────

// The widest entry here is what the overview request asks the server
// for, so the two must be widened together -- see PROGRESS_DAYS below.
const DATE_RANGES = [
  { label: '30天', days: 30 },
  { label: '90天', days: 90 },
]

const PROGRESS_DAYS = Math.max(...DATE_RANGES.map((r) => r.days))

// How far back the speed comparison samples. Unrelated to the curve's
// range tabs -- it is not something the user switches.
const SPEED_DAYS = 90

const SERIES_COLORS = ['#397365', '#A66D58', '#718666', '#B38A4A', '#6C7F88', '#8D6B78', '#567E78']

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
          className={styles.legendButton}
          style={{ opacity: hiddenSeries.has(s.name) ? 0.3 : 1 }}
        >
          <svg width="16" height="3" style={{ display: 'block', flexShrink: 0 }}>
            <line x1="0" y1="1.5" x2="16" y2="1.5" stroke={s.color} strokeWidth="2" />
          </svg>
          <span className={`text-spirit-micro ${styles.legendText}`}>{s.name}</span>
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
    <div className={styles.calendar}>
      <ActivityCalendar
        data={calendarData}
        colorScheme="light"
        theme={{ light: ['#EAE6DC', '#C9D7C3', '#97B092', '#62856B', '#315B50'] }}
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
    <div className={styles.masteryTrack}>
      <div
        className={styles.masteryFill}
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
    <div className={`${styles.card} ${styles.subjectCard}`}>
      <div className="mb-4">
        <div className="mb-3 flex flex-wrap gap-1.5">
            {stat.category.map((c) => (
              <Chip key={c.id} label={c.name} color={styles.categoryChip} />
            ))}
        </div>
        <div className="flex items-center justify-between gap-4">
          <h2 className={styles.cardTitle}>{stat.name}</h2>
          {stat.conceptGroup.length > 0 && (
            <span className={`shrink-0 text-xs ${styles.muted}`}>
              平均{' '}
              <span className={`text-base font-bold ${styles.masteryValue}`}>
                {avgMastery.toFixed(2)}
              </span>{' '}
              / 10
            </span>
          )}
        </div>
      </div>
      {stat.conceptGroup.length === 0 ? (
        <p className={`text-sm ${styles.muted}`}>尚無觀念熟練度資料</p>
      ) : (
        <div className={`flex flex-col gap-3 border-t pt-4 ${styles.subjectDivider}`}>
          <div className={`grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 text-xs font-medium ${styles.bodyText}`}>
            <span>觀念</span>
            <span className="text-right">熟練度 / 10</span>
          </div>
          {stat.conceptGroup.map((cg) => (
            <div key={cg.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1">
              <span className={`truncate text-sm ${styles.bodyText}`}>{cg.name}</span>
              <span className={`text-right text-sm font-medium ${styles.masteryValue}`}>
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
  // The progress curve that used to lead this section is subscriber-only
  // and now renders inside ProAnalysisSections, from
  // GET /analysis/overview. GET /user/history no longer returns the
  // series it was drawn from, so there is nothing here to hide.
  return (
    <div className={styles.history}>
      <div className={styles.card}>
        <h2 className={`mb-4 ${styles.cardTitle}`}>學習熱點圖</h2>
        <LearningHeatmap activityMap={history.activityMap} />
      </div>
    </div>
  )
}

// ─── Forgetting Risk (subscribers only) ───────────────────────────────────────

// Status colours, reserved for risk and never reused as a series hue.
// Each ships with an icon and a word, so the level never rests on colour
// alone -- the bar beside them is the magnitude, not the identity.
const RISK_META: Record<
  ForgettingRiskItem['level'],
  { label: string; icon: string; text: string; bg: string; bar: string }
> = {
  high: { label: '高風險', icon: '▲', text: '#963B28', bg: '#FBECE7', bar: '#C0432C' },
  medium: { label: '中風險', icon: '◆', text: '#7A5713', bg: '#FBF1DE', bar: '#B3861F' },
  low: { label: '低風險', icon: '●', text: '#2F6B4F', bg: '#E8F1EA', bar: '#3F8C66' },
}

function LockedProCard({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className={styles.card}>
      <h2 className={`mb-2 ${styles.cardTitle}`}>{title}</h2>
      <p className={`mb-4 text-sm ${styles.bodyText}`}>{blurb}</p>
      <ButtonLink href="/subscription" size="sm">
        查看訂閱方案
      </ButtonLink>
    </div>
  )
}

// Module scope, not nested inside a component: a component defined
// during render is a new type on every render, so React would unmount
// and remount the tabs (losing focus) each time the parent re-rendered.
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
    <div className={styles.tabGroup}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`${styles.tabButton} ${value === o.value ? styles.tabActive : ''}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function ProgressCard({
  progress,
  failed,
}: {
  progress: MasteryProgress | null
  failed: boolean
}) {
  const [rangeDays, setRangeDays] = useState(90)
  const [viewMode, setViewMode] = useState<'overall' | 'subjects'>('overall')

  const series = useMemo<ChartSeries[]>(() => {
    if (progress === null) return []
    const filter = (data: DailyMastery[]) => {
      const cutoff = cutoffDate(rangeDays)
      return data.filter((d) => d.date >= cutoff)
    }
    const overall: ChartSeries = {
      name: '整體',
      color: SERIES_COLORS[0],
      data: filter(progress.overall),
    }
    const subjects: ChartSeries[] = progress.subjects.map((s, i) => ({
      name: s.subjectName,
      color: SERIES_COLORS[(i + 1) % SERIES_COLORS.length],
      data: filter(s.dailyStats),
    }))
    return viewMode === 'overall' ? [overall] : subjects
  }, [progress, rangeDays, viewMode])

  return (
    <div className={styles.card}>
      <div className={styles.chartHeader}>
        <h2 className={styles.cardTitle}>進步曲線</h2>
        <div className={styles.controls}>
          <TabGroup options={VIEW_MODES} value={viewMode} onChange={setViewMode} />
          <TabGroup<number>
            options={DATE_RANGES.map((r) => ({ label: r.label, value: r.days }))}
            value={rangeDays}
            onChange={setRangeDays}
          />
        </div>
      </div>

      {failed && <p className="text-sm text-red-600">無法載入進步曲線，請稍後再試。</p>}
      {!failed && progress === null && <p className={`text-sm ${styles.muted}`}>載入中…</p>}
      {!failed && progress !== null && (
        <>
          <ProgressChart series={series} toggleable={viewMode === 'subjects'} />
          <p className={`mt-1 text-right text-[10px] ${styles.chartNote}`}>熟練度 0–10</p>
        </>
      )}
    </div>
  )
}

function ForgettingRiskCard({
  items,
  failed,
}: {
  items: ForgettingRiskItem[] | null
  failed: boolean
}) {
  return (
    <div className={styles.card}>
      <h2 className={`mb-2 ${styles.cardTitle}`}>遺忘風險提示</h2>
      <p className={`mb-4 text-sm ${styles.bodyText}`}>
        依預估記憶保留率排序，最可能忘記的排在最前面，建議由上往下複習。
      </p>

      {failed && <p className="text-sm text-red-600">無法載入遺忘風險分析，請稍後再試。</p>}

      {!failed && items === null && <p className={`text-sm ${styles.muted}`}>載入中…</p>}

      {!failed && items !== null && items.length === 0 && (
        <p className={`text-sm ${styles.muted}`}>
          還沒有足夠的練習紀錄。先做幾題，這裡就會列出需要複習的觀念。
        </p>
      )}

      {!failed && items !== null && items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const meta = RISK_META[item.level]
            const retentionPct = Math.round(item.retention * 100)
            return (
              <li key={item.conceptId} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{item.concept}</span>
                    <span className={`text-xs ${styles.muted}`}>{item.subject}</span>
                  </div>
                  <span
                    className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                    style={{ color: meta.text, backgroundColor: meta.bg }}
                  >
                    <span aria-hidden>{meta.icon}</span>
                    {meta.label}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div
                    className={styles.masteryTrack}
                    role="img"
                    aria-label={`預估記憶保留率 ${retentionPct}%`}
                  >
                    <div
                      className={styles.masteryFill}
                      style={{ width: `${retentionPct}%`, background: meta.bar }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-xs font-bold tabular-nums">
                    {retentionPct}%
                  </span>
                </div>

                <p className={`text-[11px] ${styles.muted}`}>
                  上次練習 <span className="tabular-nums">{item.daysSinceReview}</span> 天前 ·
                  {' '}熟練度 <span className="tabular-nums">{item.mastery.toFixed(1)}</span>
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── Answer Speed (subscribers only) ──────────────────────────────────────────

// Diverging pair: two poles with a neutral midpoint at the median.
// Slower is the one that wants attention, so it takes the warm hue --
// but neither is labelled good or bad on its own, which is why accuracy
// sits beside it.
const SPEED_SLOWER = '#C2561F'
const SPEED_FASTER = '#2F6B4F'

const toSeconds = (ms: number) => Math.round(ms / 1000)

function SpeedCard({
  items,
  failed,
}: {
  items: SpeedComparison[] | null
  failed: boolean
}) {
  // One shared scale across rows, so bar lengths are comparable between
  // subjects rather than each row being self-normalised.
  const comparable = (items ?? []).filter((i) => i.deltaMs !== null)
  const maxAbs = Math.max(1, ...comparable.map((i) => Math.abs(i.deltaMs!)))

  return (
    <div className={styles.card}>
      <h2 className={`mb-2 ${styles.cardTitle}`}>答題速度分析</h2>
      <p className={`mb-4 text-sm ${styles.bodyText}`}>
        近 90 天每題花費時間的中位數，與平台中位數比較。偏慢不一定是壞事，請一併看正確率。
      </p>

      {failed && <p className="text-sm text-red-600">無法載入答題速度分析，請稍後再試。</p>}

      {!failed && items === null && <p className={`text-sm ${styles.muted}`}>載入中…</p>}

      {!failed && items !== null && items.length === 0 && (
        <p className={`text-sm ${styles.muted}`}>
          近 90 天還沒有計時的作答紀錄，練習幾題後這裡就會出現比較。
        </p>
      )}

      {!failed && items !== null && items.length > 0 && (
        <ul className="flex flex-col gap-4">
          {items.map((item) => {
            const delta = item.deltaMs
            const slower = delta !== null && delta > 0
            const width = delta === null ? 0 : (Math.abs(delta) / maxAbs) * 50
            const color = delta === null ? '#A8A3A0' : slower ? SPEED_SLOWER : SPEED_FASTER
            return (
              <li key={item.subjectId} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-bold">{item.subject}</span>
                  <span className={`text-[11px] ${styles.muted}`}>
                    你 <span className="font-bold tabular-nums">{toSeconds(item.userMedianMs)}s</span>
                    {item.platformMedianMs !== null && (
                      <>
                        {' · '}中位數{' '}
                        <span className="tabular-nums">{toSeconds(item.platformMedianMs)}s</span>
                      </>
                    )}
                    {' · '}正確率 <span className="tabular-nums">{Math.round(item.accuracy)}%</span>
                    {' · '}
                    <span className="tabular-nums">{item.sampleCount}</span> 題
                  </span>
                </div>

                {delta === null ? (
                  // Never render a zero-length bar as if it meant "equal
                  // to the median" -- the comparison simply is not
                  // available yet.
                  <p className={`text-[11px] ${styles.muted}`}>樣本還不足以與平台比較</p>
                ) : (
                  <>
                    <div className="relative h-5">
                      <div className={`absolute inset-x-0 top-1.5 ${styles.masteryTrack}`} />
                      <div
                        aria-hidden
                        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#C9C3BB]"
                      />
                      <div
                        role="img"
                        aria-label={`${item.subject}：比平台中位數${slower ? '慢' : '快'} ${Math.abs(toSeconds(delta))} 秒`}
                        className="absolute top-1.5 h-[10px]"
                        style={{
                          width: `${width}%`,
                          background: color,
                          // 2px clear of the centre rule so the two sides
                          // never touch; rounded only on the outer,
                          // data-carrying end.
                          ...(slower
                            ? { left: 'calc(50% + 2px)', borderRadius: '0 2px 2px 0' }
                            : { right: 'calc(50% + 2px)', borderRadius: '2px 0 0 2px' }),
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className={styles.muted}>← 較快</span>
                      <span className="font-bold tabular-nums" style={{ color }}>
                        {slower
                          ? `慢 ${toSeconds(delta)}s`
                          : `快 ${Math.abs(toSeconds(delta))}s`}
                      </span>
                      <span className={styles.muted}>較慢 →</span>
                    </div>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// Owns the one request and the one entitlement decision for the whole
// subscriber-only section. Both cards below are presentational, so
// there is no way for them to drift into fetching separately again.
function ProAnalysisSections() {
  const { subscription } = useAuth()
  const [data, setData] = useState<GetAnalysisOverviewResponse | null>(null)
  const [failed, setFailed] = useState(false)

  const subscribed = subscription?.active === true

  useEffect(() => {
    if (!subscribed) return
    apiFetch<GetAnalysisOverviewResponse>('analysis/overview', {
        speedDays: SPEED_DAYS,
        riskLimit: 10,
        progressDays: PROGRESS_DAYS,
      })
      .then(setData)
      .catch(() => setFailed(true))
  }, [subscribed])

  // null means sync has not answered yet, which is not the same as "not
  // subscribed" -- rendering nothing keeps a subscriber from seeing the
  // locked state flash before their entitlement is known.
  if (subscription === null) return null

  if (!subscribed)
    return (
      <>
        <LockedProCard
          title="進步曲線"
          blurb="訂閱後可看見整體與各科熟練度隨時間的變化，掌握自己是否真的在進步。"
        />
        <LockedProCard
          title="遺忘風險提示"
          blurb="訂閱後可看見哪些觀念正在被遺忘，並依急迫度排出優先複習順序。"
        />
        <LockedProCard
          title="答題速度分析"
          blurb="訂閱後可比較你在每個科目的答題速度與平台中位數，看出哪一科想太久。"
        />
      </>
    )

  return (
    <>
      <ProgressCard progress={data?.progress ?? null} failed={failed} />
      <ForgettingRiskCard items={data?.forgettingRisk ?? null} failed={failed} />
      <SpeedCard items={data?.speed ?? null} failed={failed} />
    </>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AnalysisClient() {
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
    return <LoadingState />
  }

  if (error) {
    return (
      <div className={styles.errorCard}>
        <p className="text-sm">{error}</p>
        <a
          href="/"
          className={styles.errorLink}
        >
          回首頁登入
        </a>
      </div>
    )
  }

  return (
    <div className={styles.content}>
      {history && (
        <>
          <section className={styles.introScene}>
            <div className={styles.titleBand}>
              <div className={styles.titleBandInner}>
                <div className={styles.titleCopy}>
                  <h1 className={styles.pageTitle}>學習分析</h1>
                  <p>掌握練習成果，看見每一次進步</p>
                </div>
              </div>
            </div>
            <div className={styles.summaryGrid}>
              <StatCard
                label="總刷題數"
                value={history.totalAttempts}
                unit="題"
                iconSrc="/icon-total-questions.svg"
                tone="blue"
              />
              <StatCard
                label="總得分率"
                value={Math.round(history.overallAccuracy)}
                unit="%"
                sub="平均正確率"
                iconSrc="/icon-accuracy.svg"
                tone="orange"
              />
              <StatCard
                label="連續天數"
                value={history.streakDays}
                unit="天"
                iconSrc="/icon-streak-days.svg"
                tone="green"
              />
            </div>
          </section>
          <HistorySection history={history} />
        </>
      )}

      <div className={styles.proSections}>
        <ProAnalysisSections />
      </div>

      {stats && stats.length > 0 && (
        <>
          <h2 className={styles.sectionTitle}>當前熟練度</h2>
          <div className={styles.subjectGrid}>
            {stats.map((stat) => (
              <SubjectCard key={stat.id} stat={stat} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
