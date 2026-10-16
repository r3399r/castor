'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { ErrorState, LoadingState, PageHeader } from '@/components/ui'
import {
  artworkByCode,
  spiritCatalog,
  spiritImage,
  type SpiritSpecies,
} from '@/lib/guardianArtwork'

type SpeciesDto = {
  id: number
  code: string
  name: string
  theme: string
  cost: number
  sortOrder: number
  isActive: boolean
  ownerCount: number
}

const LEVELS = [1, 2, 3, 4, 5]

function Badge({ tone, children }: { tone: 'ok' | 'muted' | 'warn'; children: React.ReactNode }) {
  const palette = {
    ok: 'bg-[#E8F1EA] text-[#2F6B4F]',
    muted: 'bg-beige-200 text-black-500',
    warn: 'bg-[#FBF1DE] text-[#7A5713]',
  }[tone]
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${palette}`}>
      {children}
    </span>
  )
}

/** One level's card, or a placeholder when that level has no file yet. */
function LevelThumb({ species, level }: { species: SpiritSpecies | undefined; level: number }) {
  const src = species ? spiritImage(species, level) : undefined
  return (
    <figure className="flex w-[84px] shrink-0 flex-col items-center gap-1">
      <div className="flex h-[84px] w-[84px] items-center justify-center overflow-hidden rounded-lg border border-brown-300 bg-beige-100">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={`${species ? spiritCatalog[species].name : ''} LV${level}`}
            className="h-full w-full object-contain"
            loading="lazy"
          />
        ) : (
          <span className="text-[11px] text-black-300">無圖</span>
        )}
      </div>
      <figcaption className="text-[11px] text-black-500">LV{level}</figcaption>
    </figure>
  )
}

export default function SpeciesClient() {
  const [species, setSpecies] = useState<SpeciesDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<SpeciesDto[]>('species')
      .then(setSpecies)
      .catch(() => setError('無法載入精靈清單。'))
  }, [])

  if (error !== null) return <ErrorState>{error}</ErrorState>
  if (species === null) return <LoadingState />

  // Catalog entries with no database row: artwork and a definition exist
  // in the frontend, but nothing in the store can be bought to reach it.
  const mappedSpecies = new Set(
    species.map((row) => artworkByCode[row.code]).filter(Boolean) as SpiritSpecies[]
  )
  const unmapped = (Object.keys(spiritCatalog) as SpiritSpecies[]).filter(
    (key) => !mappedSpecies.has(key)
  )

  return (
    <>
      <PageHeader title="精靈圖鑑（唯讀）" />
      <p className="mb-6 text-sm text-black-500">
        精靈由資料庫的 <code>guardian</code> 資料列與前端寫死的圖檔對應共同構成，
        因此這裡只供檢視。新增或更換精靈需要同時提供圖檔與{' '}
        <code>artworkByCode</code> 對應，屬於程式碼變更。
      </p>

      {species.length === 0 && (
        <p className="mb-6 text-sm text-black-500">
          資料庫還沒有任何 guardian 資料列，因此精靈商店會是空的。
        </p>
      )}

      <div className="flex flex-col gap-4">
        {species.map((row) => {
          const art = artworkByCode[row.code]
          return (
            <section
              key={row.id}
              className="rounded-lg border border-brown-300 bg-white/40 p-4"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-black-900">
                    {art ? spiritCatalog[art].name : row.name}
                  </h2>
                  <code className="rounded bg-beige-200 px-1.5 py-0.5 text-[11px] text-black-700">
                    {row.code}
                  </code>
                  {row.isActive ? (
                    <Badge tone="ok">上架中</Badge>
                  ) : (
                    <Badge tone="muted">已下架</Badge>
                  )}
                  {art === undefined && <Badge tone="warn">尚無圖檔</Badge>}
                </div>
                <span className="text-xs text-black-500">
                  商店名稱 {row.name} · {row.cost} 點 · 排序 {row.sortOrder} ·{' '}
                  <span className="tabular-nums">{row.ownerCount}</span> 人擁有
                </span>
              </div>

              <p className="mb-3 text-xs text-black-500">{row.theme}</p>

              <div className="flex flex-wrap gap-3">
                {LEVELS.map((level) => (
                  <LevelThumb key={level} species={art} level={level} />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {unmapped.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-base font-bold text-black-900">尚未對應到資料列的圖鑑定義</h2>
          <p className="mb-3 text-sm text-black-500">
            前端的 <code>spiritCatalog</code> 有定義，但沒有任何 <code>guardian</code>{' '}
            資料列的 code 對應到它 —— 使用者無法在商店取得這些精靈。
          </p>
          <ul className="flex flex-wrap gap-2">
            {unmapped.map((key) => (
              <li
                key={key}
                className="rounded-lg border border-brown-300 bg-white/40 px-3 py-2 text-sm"
              >
                {spiritCatalog[key].name}
                <span className="ml-2 text-xs text-black-500">
                  {spiritCatalog[key].artwork ? '有圖檔' : '無圖檔'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
