'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import type { GetInfoPopularResponse } from '@/types/api'

// Indexed by card position, so the three cards keep the colours they had
// while this section was hardcoded.
const CARD_COLORS = ['bg-spirit-paper', 'bg-category-gold-soft', 'bg-category-leaf-soft']

// What GET /api/info/popular returns at most. Held here as well so the
// placeholder can reserve the exact space the real cards will take.
const ROWS_PER_CARD = 5

/**
 * A 2xx is no guarantee of the shape, and this section renders the names
 * it is given. A 204 arrives as undefined and anything else answering
 * this path arrives as the wrong object; either would throw while
 * rendering and take the whole landing page down with it, so it is
 * treated as a failed fetch instead.
 */
function isPopular(res: unknown): res is GetInfoPopularResponse {
  return (
    Array.isArray(res) &&
    res.every(
      (s) =>
        typeof s?.name === 'string' &&
        Array.isArray(s.exams) &&
        s.exams.every((e: unknown) => typeof (e as { name?: unknown })?.name === 'string')
    )
  )
}

function Card({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <article
      className={`${color} flex flex-col rounded-spirit-card border-2 border-spirit-leaf shadow-spirit-card transition-all duration-300 hover:-translate-y-2 hover:shadow-spirit-float`}
    >
      {/*
        flex-1 on the inner panel, because the number of exams now differs
        between cards: the grid already stretches the three articles to a
        common height, and without this the bordered panel inside a short
        card stopped partway down it.
      */}
      <div className="m-3 flex-1 rounded-spirit-control border border-spirit-line p-4">
        {children}
      </div>
    </article>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-spirit-line px-1 py-2 last:border-b-0">{children}</div>
  )
}

/**
 * A grey bar standing in for a line of text that has not arrived.
 *
 * It holds invisible text rather than setting its own height, so it
 * inherits the exact line box of whatever it is placed in -- a bar sized
 * in pixels came out a few short per line, and the card grid visibly grew
 * as the fetch landed.
 */
function Bar({ width }: { width: string }) {
  return (
    <span className="relative block text-transparent" aria-hidden="true">
      載入中
      <span
        className={`absolute inset-y-0 left-0 my-auto block h-5 rounded-full bg-spirit-mist ${width}`}
      />
    </span>
  )
}

// Mirrors a real card line for line -- a title, the rule under it and five
// rows -- so the grid does not grow when the fetch lands.
function PlaceholderCards() {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" role="status" aria-label="載入熱門科目">
      {CARD_COLORS.map((color) => (
        <Card key={color} color={color}>
          <h3 className="text-spirit-character font-bold">
            <Bar width="w-24" />
          </h3>
          <hr className="my-4 border-spirit-line" />
          <div>
            {Array.from({ length: ROWS_PER_CARD }, (_, i) => (
              <Row key={i}>
                <span className="block text-base">
                  <Bar width="w-32" />
                </span>
              </Row>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}

export default function HomeCategories() {
  const [data, setData] = useState<GetInfoPopularResponse | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    apiFetch<unknown>('info/popular')
      .then((res) => (isPopular(res) ? setData(res) : setFailed(true)))
      .catch(() => setFailed(true))
  }, [])

  // Nothing real to show. Dropping the section beats a row of empty cards,
  // and beats the invented subject names that used to stand here: an empty
  // response means the catalog has no servable questions yet, which is a
  // true thing about the site and not an error to paper over.
  if (failed || data?.length === 0) return null

  return (
    <section className="py-section-md xl:py-section-xl">
      <div className="mx-auto w-full max-w-site space-y-8 px-page-gutter xl:px-12">
        <div className="space-y-3">
          <p className="text-sm font-bold tracking-[0.12em] text-spirit-leaf uppercase">熱門分類</p>
          <h2 className="text-spirit-display-sm font-bold text-spirit-canopy">熱門考試 / 科目</h2>
        </div>

        {data === null ? (
          <PlaceholderCards />
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {data.map((subject, i) => (
              <Card key={subject.id} color={CARD_COLORS[i % CARD_COLORS.length]}>
                <h3 className="text-spirit-character font-bold text-spirit-canopy">
                  {subject.name}
                </h3>
                <hr className="my-4 border-spirit-line" />
                <div>
                  {subject.exams.length === 0 ? (
                    // A popular subject whose questions are filed under no
                    // exam. Saying so is better than an empty card, and
                    // better than dropping a subject people are answering.
                    <Row>
                      <span className="text-base text-spirit-muted">尚未分類試卷</span>
                    </Row>
                  ) : (
                    subject.exams.map((exam) => (
                      <Row key={exam.id}>
                        <span className="text-base text-spirit-ink">{exam.name}</span>
                      </Row>
                    ))
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
