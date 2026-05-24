'use client'

import { useEffect, useRef, useState } from 'react'

const H = 56

// Deterministic pseudo-random seeded by value string + digit position.
// Produces the same output on server and client — no hydration mismatch.
function getStartDigit(value: string, idx: number): number {
  const seed = value.split('').reduce((s, ch) => s + ch.charCodeAt(0), idx * 31)
  const x = Math.sin(seed) * 10000
  return Math.floor((x - Math.floor(x)) * 10)
}

export default function SlotNumber({ value }: { value: string }) {
  const [active, setActive] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActive(true)
          io.disconnect()
        }
      },
      { threshold: 0.3 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const parts = [...value].map((ch) => ({ ch, isDigit: /\d/.test(ch) }))
  const digitCount = parts.filter((p) => p.isDigit).length
  let digitIdx = 0

  return (
    <span ref={ref} className="inline-flex items-end tabular-nums" style={{ height: H }}>
      {parts.map((part, i) => {
        if (!part.isDigit) {
          return (
            <span
              key={i}
              className="text-[56px] font-semibold font-[var(--font-inter)] text-blue-700"
              style={{ lineHeight: `${H}px` }}
            >
              {part.ch}
            </span>
          )
        }

        const currentIdx = digitIdx++
        const delay = (digitCount - 1 - currentIdx) * 120
        const target = parseInt(part.ch)
        const randomStart = getStartDigit(value, currentIdx)

        // Start in second cycle (index 10+r), end in first cycle (index target).
        // translateY increases → column scrolls DOWN.
        const startY = -(10 + randomStart) * H
        const endY = -(target * H)

        return (
          <span key={i} style={{ display: 'inline-block', height: H, overflow: 'hidden' }}>
            <span
              style={{
                display: 'flex',
                flexDirection: 'column',
                transform: `translateY(${active ? endY : startY}px)`,
                transition: active
                  ? `transform 1.4s cubic-bezier(0.15, 0.85, 0.35, 1.0) ${delay}ms`
                  : 'none',
              }}
            >
              {Array.from({ length: 20 }, (_, d) => d % 10).map((d, idx) => (
                <span
                  key={idx}
                  style={{ display: 'block', height: H, lineHeight: `${H}px` }}
                  className="text-[56px] font-semibold font-[var(--font-inter)] text-blue-700"
                >
                  {d}
                </span>
              ))}
            </span>
          </span>
        )
      })}
    </span>
  )
}
