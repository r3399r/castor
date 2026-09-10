'use client'

import { useState, type ReactNode } from 'react'
import { Check, LockKeyhole, Sparkles, Sprout } from 'lucide-react'
import { Badge, ContentPanel, Progress } from '@/components/ui'
import {
  spiritCatalog,
  spiritImage,
  type SpiritSpecies,
} from '@/lib/guardianArtwork'

export function PaintedSectionDivider() {
  return (
    <svg
      className="sp-painted-divider"
      viewBox="0 0 1440 40"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M0 18 64 24 125 19 201 29 280 24 358 31 433 22 514 27 591 20 663 26 742 18 820 23 902 17 988 26 1077 16 1154 22 1240 15 1311 22 1380 12 1440 19V40H0Z"
        fill="currentColor"
      />
      <path
        d="m0 12 135 4 75 7 215-6 165 1 132-6 204 5 198-9 174 6 142-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        opacity=".5"
      />
    </svg>
  )
}
function Foliage() {
  return (
    <svg
      className="sp-foliage"
      viewBox="0 0 280 260"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        d="M111 260C122 197 149 118 211 25"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path d="M139 191C93 193 76 162 82 143c36 0 54 21 57 48ZM151 166c-8-33 7-59 41-67 9 34-13 60-41 67ZM169 123c-39-3-49-30-43-49 30 3 44 24 43 49ZM192 76c-3-31 14-52 43-57 0 30-15 46-43 57ZM123 229c20-33 49-37 73-25-16 30-43 39-73 25Z" />
    </svg>
  )
}
export function IllustratedHero({
  children,
  aside,
  decoration,
}: {
  children: ReactNode
  aside?: ReactNode
  decoration?: ReactNode
}) {
  return (
    <header className="sp-hero">
      <div className="sp-hero-decoration" aria-hidden="true">
        <Foliage />
      </div>
      {decoration}
      <div className="sp-hero-inner">
        <div className="sp-hero-copy">{children}</div>
        {aside}
      </div>
      <PaintedSectionDivider />
    </header>
  )
}
export function SpiritArtwork({
  species,
  level,
  priority = false,
}: {
  species: SpiritSpecies
  level: number
  priority?: boolean
}) {
  const src = spiritImage(species, level)
  const [failedSrc, setFailedSrc] = useState<string | undefined>()
  return src && failedSrc !== src ? (
    <img
      className="sp-artwork"
      src={src}
      alt={`${spiritCatalog[species].name} LV${level} 成長圖卡`}
      width={species === 'bird' && level === 5 ? 1240 : 1254}
      height={species === 'bird' && level === 5 ? 1269 : 1254}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailedSrc(src)}
    />
  ) : (
    <div className="sp-artwork-placeholder">
      <Sprout size={36} aria-hidden="true" />
      <span>圖卡準備中</span>
    </div>
  )
}
export function SpiritScene({
  species,
  level,
  caption,
  priority = false,
}: {
  species: SpiritSpecies
  level: number
  caption?: string
  priority?: boolean
}) {
  return (
    <figure className={`sp-scene sp-scene--${spiritCatalog[species].tone}`}>
      <div className="sp-scene-decoration" aria-hidden="true">
        <Foliage />
        <span className="sp-mote" />
      </div>
      <div className="sp-artwork-frame">
        <SpiritArtwork species={species} level={level} priority={priority} />
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}
export function SpiritStatusCard({
  species,
  level,
  xp,
  nextLevelXp,
  children,
}: {
  species: SpiritSpecies
  level: number
  xp: number
  nextLevelXp: number | null
  children?: ReactNode
}) {
  const definition = spiritCatalog[species]
  const complete = level >= 5
  return (
    <ContentPanel className="sp-status">
      <div className="sp-status-heading">
        <div>
          <p className="sp-eyebrow">{definition.category}</p>
          <h2>{definition.name}</h2>
        </div>
        <Badge tone={complete ? 'complete' : 'growth'}>
          {complete ? (
            <Check size={14} aria-hidden="true" />
          ) : (
            <Sprout size={14} aria-hidden="true" />
          )}
          {complete ? '已完成' : '培育中'} · LV{level}
        </Badge>
      </div>
      <p className="sp-description">
        守護靈會隨著你投入的成長經驗逐步升級，並解鎖新的外觀與棲地內容。
      </p>
      <div className="sp-progress-heading">
        <span>成長經驗</span>
        <strong>
          {complete
            ? '成長已完成'
            : `${xp.toLocaleString()} / ${(nextLevelXp ?? 0).toLocaleString()} XP`}
        </strong>
      </div>
      <Progress
        value={complete ? 1 : xp}
        max={complete ? 1 : (nextLevelXp ?? 1)}
        label={`${definition.name}成長經驗`}
      />
      <div className="sp-progress-caption">
        <span>
          LV{level} · {definition.stages[level - 1]}
        </span>
        <span>
          {complete ? '五個階段，完整收藏' : `下一階段 LV${level + 1}`}
        </span>
      </div>
      {children}
    </ContentPanel>
  )
}
export function GrowthTrack({
  species,
  selectedLevel,
  unlockedLevel,
  onSelect,
}: {
  species: SpiritSpecies
  selectedLevel: number
  unlockedLevel: number
  onSelect: (level: number) => void
}) {
  return (
    <ol className="sp-growth-track">
      {[1, 2, 3, 4, 5].map((level) => (
        <li key={level}>
          <button
            type="button"
            aria-pressed={selectedLevel === level}
            onClick={() => onSelect(level)}
            aria-label={`預覽 ${spiritCatalog[species].name} LV${level}${level > unlockedLevel ? '，尚未解鎖' : '，已解鎖'}`}
          >
            <span className="sp-growth-image">
              <SpiritArtwork species={species} level={level} />
              {level > unlockedLevel && (
                <span className="sp-lock">
                  <LockKeyhole size={12} aria-hidden="true" />
                </span>
              )}
            </span>
            <strong>LV{level}</strong>
            <span>
              {spiritCatalog[species].stages[level - 1] || '成長階段'}
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}
export function RewardBanner({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="sp-reward">
      <Sparkles size={23} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  )
}
export function IllustratedEmptyState({
  title,
  children,
  action,
  species = 'deer',
}: {
  title: string
  children: ReactNode
  action?: ReactNode
  species?: SpiritSpecies
}) {
  return (
    <ContentPanel className="sp-empty">
      <SpiritScene species={species} level={1} />
      <div>
        <p className="sp-eyebrow">每段成長，都從這裡開始</p>
        <h2>{title}</h2>
        <div className="sp-description">{children}</div>
        {action && <div className="sp-actions">{action}</div>}
      </div>
    </ContentPanel>
  )
}
