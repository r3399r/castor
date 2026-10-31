'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import SlotNumber from '@/components/SlotNumber'
import type { GetInfoStatsResponse } from '@/types/api'

// The labels are the fixed part of the bar; only the numbers come from the
// API. Keeping them here (rather than deriving the rows from the response)
// means the five cells, and so the responsive 3+2 / 5-column layouts
// below, exist from the first paint instead of appearing once the fetch
// lands.
const CELLS: { key: keyof GetInfoStatsResponse; label: string }[] = [
  { key: 'categoryCount', label: '種類別' },
  { key: 'subjectCount', label: '種科目' },
  { key: 'examCount', label: '張試卷' },
  { key: 'questionCount', label: '道試題' },
  { key: 'userCount', label: '名使用者' },
]

// Matches SlotNumber's own reel height, so the placeholder reserves the
// exact space the number will take and the bar doesn't jump.
const NUMBER_HEIGHT = 56

function StatCell({ value, label }: { value: number | null; label: string }) {
  return (
    <>
      {/*
        SlotNumber animates its reels once, on the first intersection after
        mount. It is mounted only with the real value for that reason: a
        placeholder SlotNumber would spend its one animation on the
        placeholder and then snap to the real number without rolling.
      */}
      {value === null ? (
        <span style={{ height: NUMBER_HEIGHT }} aria-hidden="true" />
      ) : (
        <SlotNumber value={value.toLocaleString('en-US')} />
      )}
      <p className="mt-2 text-sm text-spirit-muted">{label}</p>
    </>
  )
}

export default function HomeStatsBar() {
  const [data, setData] = useState<GetInfoStatsResponse | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    apiFetch<GetInfoStatsResponse>('info/stats')
      .then(setData)
      .catch(() => setFailed(true))
  }, [])

  // Nothing to count with -- better to drop the bar than to leave a row of
  // empty cells, or to show numbers that aren't real.
  if (failed) return null

  const stats = CELLS.map(({ key, label }) => ({
    label,
    value: data === null ? null : data[key],
  }))

  return (
    <section>

      {/* Mobile: 單欄，水平線內縮 16px，無豎線 */}
      <div className="border-y border-spirit-line md:hidden">
        <div className="flex flex-col py-10">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center py-10">
              <StatCell value={stat.value} label={stat.label} />
            </div>
          ))}
        </div>
      </div>

      {/* Tablet: 上3下2，下排靠左 */}
      <div className="hidden border-y border-spirit-line md:block xl:hidden">
        <div className="flex flex-col py-10">
          <div className="flex">
            {stats.slice(0, 3).map((stat, i) => (
              <div
                key={stat.label}
                className={`flex w-1/3 flex-col items-center justify-center py-4${i > 0 ? ' border-l border-spirit-line' : ''}`}
              >
                <StatCell value={stat.value} label={stat.label} />
              </div>
            ))}
          </div>
          <div className="flex">
            {stats.slice(3).map((stat, i) => (
              <div
                key={stat.label}
                className={`flex w-1/3 flex-col items-center justify-center py-4${i === 1 ? ' border-x border-spirit-line' : ''}`}
              >
                <StatCell value={stat.value} label={stat.label} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop: 單排 5 欄 */}
      <div className="hidden border-y border-spirit-line xl:block">
        <div className="flex justify-center py-10">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className={`flex w-[196px] flex-col items-center justify-center border-l border-spirit-line py-4${i === stats.length - 1 ? ' border-r' : ''}`}
            >
              <StatCell value={stat.value} label={stat.label} />
            </div>
          ))}
        </div>
      </div>

    </section>
  )
}
