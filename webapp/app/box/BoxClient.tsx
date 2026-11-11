'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { formatNumber } from '@/lib/number'
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Coins,
  LockKeyhole,
  ShoppingBag,
  Sparkles,
  Sprout,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  ContentPanel,
  Modal,
  Progress,
  Tabs,
} from '@/components/ui'
import {
  GrowthTrack,
  IllustratedEmptyState,
  IllustratedHero,
  RewardBanner,
  SpiritArtwork,
  SpiritScene,
  SpiritStatusCard,
} from '@/components/spirit'
import { artworkByCode, spiritCatalog, type SpiritSpecies } from '@/lib/guardianArtwork'
import { apiFetch, apiPost } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import SupportNote from './SupportNote'
/**
 * Runtime code comes straight from the shared package, never through
 * `@/types/api`.
 *
 * That barrel is `export * from '@castor/shared'`, so this would work
 * either way -- but it is the webapp's type barrel, used for types by
 * every other screen, and an import of a *function* from a file called
 * `types` reads like a type-only import that the compiler erases. The
 * growth bonus is the first runtime code the shared package has ever
 * carried; keeping its import path visibly different is what stops the
 * next reader from assuming otherwise.
 */
import { investmentXp, pointsForXp } from '@castor/shared'
import type { Guardian, PostGuardianInvestResponse } from '@/types/api'
import { DonationDemoBox } from './DonationDemo'
import { DonationEntry } from './DonationFlow'

// The shared contract, not a local copy of it. There used to be a
// hand-written duplicate here; it silently fell behind when the API began
// returning the spirit's public-interest category, which the LV5 donation
// panel needs.
type GuardianDto = Guardian

type SpeciesDto = {
  id: number
  code: string
  name: string
  theme: string
  cost: number
  owned: boolean
  level: number | null
}

/** Levels in a complete collection series, matching the backend's MAX_LEVEL. */
const MAX_LEVEL = 5
const tabs = [
  {
    value: 'growing',
    label: '培育中',
    icon: <Sprout size={18} aria-hidden="true" />,
  },
  {
    value: 'store',
    label: '精靈商店',
    icon: <ShoppingBag size={18} aria-hidden="true" />,
  },
  {
    value: 'collection',
    label: '我的圖鑑',
    icon: <BookOpen size={18} aria-hidden="true" />,
  },
] as const
const steps = [
  ['完成練習', '完成題目並累積學習成果'],
  ['累積積分', '把每次練習轉換成可使用的積分'],
  ['兌換蛋', '在精靈商店選擇喜歡的精靈'],
  ['培育精靈', '投入積分，解鎖不同成長階段'],
  ['解鎖公益支持', '滿級後支持相應主題的公益計畫'],
]
function ArtworkPlaceholder() {
  return (
    <div className="sp-artwork-placeholder">
      <Sprout size={32} aria-hidden="true" />
      <span>精靈圖片預留位置</span>
    </div>
  )
}
export default function BoxClient() {
  const searchParams = useSearchParams()
  return searchParams.get('demo') === 'donation' ? <DonationDemoBox /> : <RealBoxClient />
}

function RealBoxClient() {
  const { subscription } = useAuth()
  const [activeTab, setActiveTab] = useState<
    'growing' | 'store' | 'collection'
  >('growing')
  const [guardians, setGuardians] = useState<GuardianDto[]>([])
  const [species, setSpecies] = useState<SpeciesDto[]>([])
  const [totalPoints, setTotalPoints] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selectedGuardianId, setSelectedGuardianId] = useState<number | null>(null)
  const [pointsToUse, setPointsToUse] = useState(1)
  const [eggToExchange, setEggToExchange] = useState<SpeciesDto | null>(null)
  const [showInvestDialog, setShowInvestDialog] = useState(false)
  const [levelUpCelebration, setLevelUpCelebration] = useState<{
    name: string
    level: number
    species?: SpiritSpecies
  } | null>(null)
  const [collectionPreview, setCollectionPreview] = useState<{
    name: string
    theme: string
    level: number
    species?: SpiritSpecies
  } | null>(null)
  const [previewLevel, setPreviewLevel] = useState<number | null>(null)
  // Both endpoints report totalPoints, and both are invalidated by either
  // action (redeeming changes the store and the balance; investing changes
  // the guardian and the balance), so they are always refreshed together.
  const reload = useCallback(async () => {
    const [guardianRes, storeRes] = await Promise.all([
      apiFetch<{ data: GuardianDto[]; totalPoints: number }>('guardian'),
      apiFetch<{ data: SpeciesDto[]; totalPoints: number }>('store/species'),
    ])
    setGuardians(guardianRes.data)
    setSpecies(storeRes.data)
    setTotalPoints(guardianRes.totalPoints)
    setPointsToUse((value) => Math.min(Math.max(value, 1), guardianRes.totalPoints))
  }, [])

  useEffect(() => {
    reload()
      .catch(() => setLoadError('無法載入精靈資料，請稍後再試。'))
      .finally(() => setLoading(false))
  }, [reload])

  const hasGuardian = guardians.length > 0
  const guardian =
    guardians.find((item) => item.id === selectedGuardianId) ?? guardians[0]
  const artwork = guardian ? artworkByCode[guardian.code] : undefined
  const availablePoints = totalPoints
  const level = guardian?.level ?? 1
  const complete = level >= MAX_LEVEL
  // `entitled`, not `active`: cancelling auto-renew flips the period to
  // `cancelled` immediately while the days already paid for keep running,
  // so `active` goes false for someone who still has paid access -- and
  // the server grants them the bonus regardless of what this says. A day
  // pass reports both, having no agreement to cancel in the first place.
  const hasMemberExperienceBonus = subscription?.entitled === true
  const xpUntilNextLevel =
    guardian === undefined || guardian.nextLevelXp === null
      ? 0
      : Math.max(guardian.nextLevelXp - guardian.xp, 0)
  /**
   * Points, not XP: the growth bonus means these differ for a subscriber.
   *
   * This is both the cap and the figure shown as the amount this stage
   * still needs, so it has to be what the user would actually spend --
   * 2,273 points for a 2,500 XP gap, not 2,500. If the entitlement flag
   * here is stale the cap is merely 10% generous or 10% tight; the grant
   * is the server's own, computed from its own lookup.
   */
  const pointsUntilNextLevel = pointsForXp(xpUntilNextLevel, hasMemberExperienceBonus)
  const maxInvestablePoints = Math.min(availablePoints, pointsUntilNextLevel)
  const shownLevel = previewLevel ?? level
  const totalExperienceXp = investmentXp(pointsToUse, hasMemberExperienceBonus)
  const memberBonusXp = totalExperienceXp - pointsToUse

  useEffect(() => {
    setPointsToUse((value) => {
      if (maxInvestablePoints === 0) return 0
      return Math.min(Math.max(value, 1), maxInvestablePoints)
    })
  }, [maxInvestablePoints])

  // Started species first, so the collection opens on what the user has
  // actually been growing.
  const collection = [...species].sort(
    (a, b) => Number((b.level ?? 0) > 0) - Number((a.level ?? 0) > 0),
  )

  /**
   * Refreshes the view after an action that already succeeded.
   *
   * Deliberately outside the action's own try/catch. A failure here means
   * the figures on screen are stale, NOT that the action failed --
   * reporting it as a failure would invite a retry, and a retried redeem
   * answers ALREADY_OWNED while a retried invest spends the points a
   * second time.
   */
  const refreshAfterAction = () => {
    setRefreshFailed(false)
    reload().catch(() => setRefreshFailed(true))
  }

  const confirmRedeem = async () => {
    if (eggToExchange === null) return
    setBusy(true)
    setActionError(null)
    try {
      await apiPost('store/redeem', { speciesId: eggToExchange.id })
    } catch {
      setActionError('兌換失敗，請確認積分是否足夠後再試一次。')
      setBusy(false)
      return
    }
    setEggToExchange(null)
    setBusy(false)
    refreshAfterAction()
  }

  const confirmInvest = async () => {
    if (guardian === undefined) return
    setBusy(true)
    setActionError(null)
    /**
     * Whether to celebrate is read off the response, not predicted from
     * `pointsToUse >= pointsUntilNextLevel`.
     *
     * That prediction was wrong for exactly the people the growth bonus
     * is for: with the bonus counted, 2,273 points reach a 2,500 XP
     * threshold, so a subscriber investing anything in 2,273..2,499
     * levelled up on the server while the client concluded they had not
     * -- the new level simply appeared after the refresh, with no
     * celebration. Comparing levels cannot drift, and it is also right
     * when the client's own idea of entitlement is stale.
     */
    let result
    try {
      result = await apiPost<PostGuardianInvestResponse>(
        `guardian/${guardian.id}/invest`,
        { points: pointsToUse }
      )
    } catch {
      setActionError('投入失敗，請稍後再試一次。')
      setBusy(false)
      return
    }
    setShowInvestDialog(false)
    setBusy(false)
    if (result.guardian.level > guardian.level) {
      setLevelUpCelebration({
        name: artwork ? spiritCatalog[artwork].name : guardian.name,
        level: Math.min(result.guardian.level, MAX_LEVEL),
        species: artwork,
      })
    }
    refreshAfterAction()
  }
  const investControls = (
    <div className="sp-invest">
      <div className="sp-invest-title">
        <Sparkles size={18} aria-hidden="true" />
        <h3>投入積分</h3>
      </div>
      <p className="sp-description">
        選擇要投入的積分，增加這隻精靈的成長經驗。
      </p>
      {hasMemberExperienceBonus && (
        <div className="sp-member-bonus">
          <Badge tone="growth">訂閱會員</Badge>
          <div>
            <strong>培育經驗額外 +10%</strong>
            <span>
              會員加成試算：投入 {formatNumber(pointsToUse)} 點，預計獲得{' '}
              {formatNumber(totalExperienceXp)} XP（含 +{formatNumber(memberBonusXp)} XP）
            </span>
          </div>
        </div>
      )}
      {availablePoints === 0 && (
        <p className="sp-inline-notice">
          目前沒有可分配的積分。完成更多練習後，就能繼續培育這隻精靈。
        </p>
      )}
      {availablePoints > 0 && maxInvestablePoints > 0 && (
        <p className="sp-stage-limit" role="status">
          本階段還需 <strong>{formatNumber(pointsUntilNextLevel)} 點</strong>
          即可升級；升級後可繼續投入剩餘積分。
        </p>
      )}
      <div className="sp-invest-selector">
        <div className="sp-invest-value-row">
          <span>本次投入</span>
          <label className="sp-invest-value">
            <span className="sr-only">精確輸入投入積分點數</span>
            <input
              type="number"
              inputMode="numeric"
              min={maxInvestablePoints === 0 ? 0 : 1}
              max={maxInvestablePoints}
              value={pointsToUse}
              disabled={maxInvestablePoints === 0}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => {
                const nextValue = Number(event.target.value)
                if (Number.isFinite(nextValue))
                  setPointsToUse(
                    Math.min(
                      maxInvestablePoints,
                      Math.max(0, Math.trunc(nextValue)),
                    ),
                  )
              }}
              onBlur={() => {
                if (maxInvestablePoints > 0 && pointsToUse < 1) setPointsToUse(1)
              }}
            />
            <span>點</span>
          </label>
        </div>
        <input
          className="sp-invest-range"
          type="range"
          min={maxInvestablePoints === 0 ? 0 : 1}
          max={Math.max(maxInvestablePoints, 1)}
          step={1}
          value={pointsToUse}
          disabled={maxInvestablePoints === 0}
          aria-label="選擇投入積分點數"
          aria-valuetext={`${formatNumber(pointsToUse)} 點`}
          onChange={(event) => setPointsToUse(Number(event.target.value))}
          style={{
            '--sp-invest-progress': `${
              maxInvestablePoints === 1
                ? 100
                : maxInvestablePoints > 1
                ? ((pointsToUse - 1) / (maxInvestablePoints - 1)) * 100
                : 0
            }%`,
          } as React.CSSProperties}
        />
        <div className="sp-invest-range-labels" aria-hidden="true">
          <span>{maxInvestablePoints === 0 ? '0' : '1'}</span>
          <span>本階段最多 {formatNumber(maxInvestablePoints)}</span>
        </div>
        <div className="sp-invest-actions">
          <div className="sp-invest-presets" aria-label="快速選擇投入比例">
            {[
              { label: '25%', ratio: 0.25 },
              { label: '50%', ratio: 0.5 },
              { label: '投入階段上限', ratio: 1 },
            ].map(({ label, ratio }) => {
              const value =
                maxInvestablePoints === 0
                  ? 0
                  : Math.max(1, Math.round(maxInvestablePoints * ratio))
              return (
                <Button
                  key={label}
                  variant="secondary"
                  size="sm"
                  className="sp-invest-preset"
                  disabled={maxInvestablePoints === 0}
                  aria-pressed={pointsToUse === value}
                  onClick={() => setPointsToUse(value)}
                >
                  {label}
                </Button>
              )
            })}
          </div>
          <Button
            className="sp-invest-confirm"
            onClick={() => setShowInvestDialog(true)}
            disabled={maxInvestablePoints === 0 || pointsToUse < 1}
          >
            <Sparkles size={16} aria-hidden="true" />
            確認投入
          </Button>
        </div>
      </div>
    </div>
  )

  const guardianSelector = (
    <label className="sp-select sp-guardian-selector">
      <span>切換精靈</span>
      <span className="sp-select-control">
        <select
          value={guardian?.id ?? ''}
          onChange={(event) => {
            setSelectedGuardianId(Number(event.target.value))
            setPreviewLevel(null)
          }}
        >
          {guardians.map((item) => (
            <option key={item.id} value={item.id}>
              {artworkByCode[item.code]
                ? spiritCatalog[artworkByCode[item.code]!].name
                : item.name}{' '}
              · LV{item.level}
            </option>
          ))}
        </select>
        <ChevronDown size={16} aria-hidden="true" />
      </span>
    </label>
  )

  if (loading)
    return (
      <div className="sp-box">
        <p className="sp-description">載入中…</p>
      </div>
    )

  if (loadError !== null)
    return (
      <div className="sp-box">
        <p className="sp-inline-notice">{loadError}</p>
      </div>
    )

  return (
    <div className="sp-box">
      <IllustratedHero
        decoration={<div className="sp-mobile-leaves" aria-hidden="true" />}
        aside={
          <Card className="sp-balance">
            {/* Native images retain the supplied alpha and independent positioning. */}
            <img
              className="sp-points-vine sp-points-vine-top"
              src="/images/points-vine-top-left.webp"
              alt=""
              aria-hidden="true"
              draggable={false}
              width={360}
              height={290}
            />
            <img
              className="sp-points-vine sp-points-vine-bottom"
              src="/images/points-vine-bottom-right.webp"
              alt=""
              aria-hidden="true"
              draggable={false}
              width={820}
              height={340}
            />
            <div className="sp-points-copy">
              <p>目前積分</p>
              <strong>
                {formatNumber(availablePoints)}
                <span> 點</span>
              </strong>
            </div>
          </Card>
        }
      >
        <h1>
          精靈養成<span>將智慧練習成果化為積分，兌換經驗值，讓精靈逐步成長。</span>
        </h1>
      </IllustratedHero>
      <div className="sp-box-content">
        <Tabs
          id="gift-tabs"
          label="精靈養成功能"
          value={activeTab}
          onChange={setActiveTab}
          items={tabs}
        />
        <main
          id="gift-tabs-panel"
          role="tabpanel"
          aria-labelledby={`gift-tabs-${activeTab}`}
          tabIndex={0}
        >
          {refreshFailed && (
            <p className="sp-inline-notice" role="status">
              操作已完成，但畫面上的數字可能不是最新的。請重新整理頁面。
            </p>
          )}
          {activeTab === 'growing' ? (
            <>
              {hasGuardian ? (
                <>
                  <div className="sp-growing-layout">
                    <div className="sp-companion-art">
                      {artwork ? (
                        <SpiritScene
                          species={artwork}
                          level={shownLevel}
                          priority
                          caption={`LV${shownLevel}`}
                        />
                      ) : (
                        <ArtworkPlaceholder />
                      )}
                    </div>
                    {artwork ? (
                      <SpiritStatusCard
                        headerAction={guardianSelector}
                        species={artwork}
                        level={level}
                        xp={guardian.xp}
                        nextLevelXp={complete ? null : guardian.nextLevelXp}
                      >
                        {complete ? (
                          <DonationEntry guardian={guardian} species={artwork} />
                        ) : (
                          investControls
                        )}
                      </SpiritStatusCard>
                    ) : (
                      <ContentPanel className="sp-status">
                        <div className="sp-status-heading">
                          <div>
                            <p className="sp-eyebrow">{guardian.theme}</p>
                            <h2>{guardian.name}</h2>
                          </div>
                          {guardianSelector}
                        </div>
                        <p className="sp-description">
                          精靈會隨著你投入的成長經驗逐步升級，並解鎖新的外觀與棲地內容。
                        </p>
                        <Progress
                          label="成長經驗"
                          value={complete ? 1 : guardian.xp}
                          max={complete ? 1 : (guardian.nextLevelXp ?? 1)}
                        />
                        {complete ? (
                          <RewardBanner title="已完成培育">
                            五個成長階段已完成。
                          </RewardBanner>
                        ) : (
                          investControls
                        )}
                      </ContentPanel>
                    )}
                  </div>
                  {artwork && (
                    <ContentPanel className="sp-journey">
                      <div className="sp-section-heading">
                        <h2>成長進度</h2>
                      </div>
                      <GrowthTrack
                        species={artwork}
                        unlockedLevel={level}
                        xp={guardian.xp}
                        nextLevelXp={complete ? null : guardian.nextLevelXp}
                      />
                    </ContentPanel>
                  )}
                </>
              ) : (
                <>
                  <IllustratedEmptyState
                    title="還沒有正在培育的精靈"
                    lockedEgg
                    action={
                      <>
                        <a
                          href="/adaptive"
                          className="sp-button sp-button--primary"
                        >
                          前往練習
                        </a>
                        <Button
                          variant="secondary"
                          onClick={() => setActiveTab('store')}
                        >
                          看看精靈商店
                        </Button>
                      </>
                    }
                  >
                    完成題目累積積分，兌換第一顆蛋，開始培育你的精靈。
                  </IllustratedEmptyState>
                  <ContentPanel className="sp-how">
                    <p className="sp-eyebrow">HOW IT WORKS</p>
                    <h2>培育精靈的旅程</h2>
                    <ol>
                      {steps.map(([title, description], index) => (
                        <li key={title}>
                          <span>0{index + 1}</span>
                          {index < steps.length - 1 && (
                            <ArrowRight
                              className="sp-how-arrow"
                              size={16}
                              strokeWidth={1.8}
                              aria-hidden="true"
                            />
                          )}
                          <h3>{title}</h3>
                          <p>{description}</p>
                        </li>
                      ))}
                    </ol>
                  </ContentPanel>
                </>
              )}
              <SupportNote />
            </>
          ) : activeTab === 'store' ? (
            <>
              <div className="sp-section-heading">
                <div>
                  <p className="sp-eyebrow">A NEW BEGINNING</p>
                  <h2>選擇一顆精靈之蛋</h2>
                  <p className="sp-description">
                    使用練習累積的積分兌換蛋，選擇你想支持的公益主題，開始一段新的培育旅程。
                  </p>
                </div>
                <Badge tone="growth">
                  <Coins size={16} aria-hidden="true" />
                  可使用 {formatNumber(availablePoints)} 點
                </Badge>
              </div>
              {availablePoints === 0 && (
                <RewardBanner title="目前還沒有可使用的積分">
                  商品仍可先瀏覽。完成練習累積積分後，就能回來兌換喜歡的蛋。
                  <a href="/adaptive" className="sp-text-link">
                    前往練習 →
                  </a>
                </RewardBanner>
              )}
              <div className="sp-store-grid">
                {species.map((egg) => {
                  const pointsNeeded = Math.max(egg.cost - availablePoints, 0)
                  const canAfford = availablePoints >= egg.cost
                  const isOwned = egg.owned
                  const art = artworkByCode[egg.code]
                  return (
                    <Card key={egg.id} className="sp-store-card">
                      <div className="sp-store-art">
                        {art ? (
                          <SpiritArtwork species={art} level={1} />
                        ) : (
                          <img
                            className="sp-store-egg"
                            src="/images/locked-egg.webp"
                            alt={`${egg.name}，精靈外觀尚未公開`}
                            draggable={false}
                          />
                        )}
                      </div>
                      <div className="sp-store-info">
                        <p className="sp-eyebrow">{egg.theme}</p>
                        <div className="sp-store-title">
                          <h3>{egg.name}</h3>
                          <Badge tone={isOwned ? 'complete' : 'neutral'}>
                            {isOwned ? (
                              <Check size={12} aria-hidden="true" />
                            ) : (
                              <LockKeyhole size={12} aria-hidden="true" />
                            )}
                            {isOwned ? '已擁有' : '未取得'}
                          </Badge>
                        </div>
                        <p className="sp-description">
                          孵化並培育這顆蛋，逐步解鎖精靈與牠的專屬棲地。
                        </p>
                        <div className="sp-store-purchase">
                          <div className="sp-progress-heading">
                            <span>兌換所需</span>
                            <strong>
                              <Coins size={16} aria-hidden="true" />
                              {formatNumber(egg.cost)} 點
                            </strong>
                          </div>
                          {!isOwned && !canAfford && (
                            <>
                              <Progress
                                value={availablePoints}
                                max={egg.cost}
                                label={`${egg.name}兌換積分`}
                              />
                              <p className="sp-caption">
                                還差 {formatNumber(pointsNeeded)} 點
                              </p>
                            </>
                          )}
                          <Button
                            variant={isOwned ? 'secondary' : 'primary'}
                            disabled={isOwned || !canAfford}
                            onClick={() => setEggToExchange(egg)}
                          >
                            {isOwned
                              ? '已擁有'
                              : canAfford
                                ? '兌換'
                                : '積分不足'}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </>
          ) : (
            <>
              <div className="sp-section-heading">
                <div>
                  <p className="sp-eyebrow">THE GROWTH COLLECTION</p>
                  <h2>我的精靈圖鑑</h2>
                  <p className="sp-description">
                    收藏每一隻精靈的成長足跡。已解鎖的階段可以點擊放大查看。
                  </p>
                </div>
                <Badge tone="growth">
                  已解鎖圖鑑{' '}
                  {collection.reduce((sum, item) => sum + (item.level ?? 0), 0)}{' '}
                  / {collection.length * MAX_LEVEL}
                </Badge>
              </div>
              {!hasGuardian && (
                <IllustratedEmptyState
                  title="你的圖鑑還是空的"
                  lockedEgg
                  action={
                    <Button onClick={() => setActiveTab('store')}>
                      前往精靈商店
                    </Button>
                  }
                >
                  兌換並培育精靈後，每個解鎖的成長階段都會收藏在這裡。
                </IllustratedEmptyState>
              )}
              {collection.map((series) => {
                const unlockedLevel = series.level ?? 0
                const art = artworkByCode[series.code]
                const name = art ? spiritCatalog[art].name : series.name
                return (
                  <ContentPanel
                    key={series.id}
                    className="sp-collection-series"
                  >
                    <div className="sp-section-heading">
                      <div>
                        <p className="sp-eyebrow">
                          {art ? spiritCatalog[art].category : series.theme}
                        </p>
                        <h3>{name}</h3>
                      </div>
                      <Badge
                        tone={unlockedLevel === 5 ? 'complete' : 'neutral'}
                      >
                        {unlockedLevel === 5
                          ? '已完成'
                          : unlockedLevel
                            ? '進行中'
                            : '未取得'}{' '}
                        · {unlockedLevel} / 5
                      </Badge>
                    </div>
                    <div className="sp-collection-grid">
                      {[1, 2, 3, 4, 5].map((stage) => {
                        const unlocked = stage <= unlockedLevel
                        return (
                          <button
                            key={stage}
                            className="sp-collection-card"
                            type="button"
                            disabled={!unlocked}
                            onClick={() =>
                              setCollectionPreview({
                                name,
                                theme: series.theme,
                                level: stage,
                                species: art,
                              })
                            }
                          >
                            <span className="sp-collection-art">
                              {!unlocked ? (
                                <img
                                  className="sp-collection-locked-egg"
                                  src="/images/locked-egg.webp"
                                  alt=""
                                  aria-hidden="true"
                                  draggable={false}
                                />
                              ) : art ? (
                                <SpiritArtwork species={art} level={stage} />
                              ) : (
                                <ArtworkPlaceholder />
                              )}
                              {!unlocked && (
                                <span className="sp-collection-lock">
                                  <LockKeyhole size={18} aria-hidden="true" />
                                  <span>尚未解鎖</span>
                                </span>
                              )}
                            </span>
                            <span className="sp-collection-label">
                              <strong>LV{stage}</strong>
                              <span>
                                {unlocked ? '已解鎖 · 點擊查看' : '尚未解鎖'}
                              </span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </ContentPanel>
                )
              })}
            </>
          )}
        </main>
      </div>
      {eggToExchange && (
        <Modal
          title="確定要兌換這顆蛋嗎？"
          onClose={() => setEggToExchange(null)}
        >
          <div className="sp-dialog-item">
            <div>
              {artworkByCode[eggToExchange.code] ? (
                <SpiritArtwork
                  species={artworkByCode[eggToExchange.code]!}
                  level={1}
                />
              ) : (
                <ArtworkPlaceholder />
              )}
            </div>
            <div>
              <p className="sp-eyebrow">{eggToExchange.theme}</p>
              <h3>{eggToExchange.name}</h3>
              <p>將使用 {formatNumber(eggToExchange.cost)} 點</p>
            </div>
          </div>
          <TransactionSummary
            available={availablePoints}
            amount={eggToExchange.cost}
            label="本次兌換"
          />
          {actionError && <p className="sp-inline-notice">{actionError}</p>}
          <div className="sp-dialog-actions">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setEggToExchange(null)}
            >
              取消
            </Button>
            <Button disabled={busy} onClick={confirmRedeem}>
              {busy ? '兌換中…' : '確認兌換'}
            </Button>
          </div>
        </Modal>
      )}
      {showInvestDialog && (
        <Modal
          title="確定要投入積分嗎？"
          onClose={() => setShowInvestDialog(false)}
        >
          <Card className="sp-note">
            <p>培育對象</p>
            <h3>{artwork ? spiritCatalog[artwork].name : (guardian?.name ?? '')}</h3>
          </Card>
          <TransactionSummary
            available={availablePoints}
            amount={pointsToUse}
            label="本次投入"
          />
          {hasMemberExperienceBonus && (
            <MemberExperienceBonus amount={pointsToUse} />
          )}
          {actionError && <p className="sp-inline-notice">{actionError}</p>}
          <div className="sp-dialog-actions">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setShowInvestDialog(false)}
            >
              取消
            </Button>
            <Button disabled={busy} onClick={confirmInvest}>
              {busy ? '投入中…' : '確認投入'}
            </Button>
          </div>
        </Modal>
      )}
      {collectionPreview && (
        <Modal
          title={`${collectionPreview.name} · LV${collectionPreview.level}`}
          className="sp-modal--art"
          onClose={() => setCollectionPreview(null)}
        >
          <p className="sp-eyebrow">{collectionPreview.theme}</p>
          <div className="sp-dialog-art">
            {collectionPreview.species ? (
              <SpiritArtwork
                species={collectionPreview.species}
                level={collectionPreview.level}
                priority
              />
            ) : (
              <ArtworkPlaceholder />
            )}
          </div>
        </Modal>
      )}
      {levelUpCelebration && (
        <Modal
          title="精靈升級！"
          className="sp-level-up-modal"
          onClose={() => setLevelUpCelebration(null)}
        >
          <div className="sp-level-up-effect" aria-hidden="true">
            {Array.from({ length: 12 }, (_, index) => (
              <span
                key={index}
                style={{ '--sp-mote-delay': `${index * 45}ms` } as React.CSSProperties}
              />
            ))}
          </div>
          <div className="sp-level-up-art">
            {levelUpCelebration.species ? (
              <SpiritArtwork
                species={levelUpCelebration.species}
                level={levelUpCelebration.level}
                priority
              />
            ) : (
              <ArtworkPlaceholder />
            )}
          </div>
          <div className="sp-level-up-copy">
            <Badge tone="growth">LV{levelUpCelebration.level} 解鎖</Badge>
            <h3>{levelUpCelebration.name}升級了！</h3>
            <p>新的成長階段已解鎖，可以繼續投入積分培育精靈。</p>
          </div>
          <div className="sp-dialog-actions">
            <Button onClick={() => setLevelUpCelebration(null)}>繼續培育</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
function TransactionSummary({
  available,
  amount,
  label,
}: {
  available: number
  amount: number
  label: string
}) {
  return (
    <dl className="sp-transaction">
      <div>
        <dt>目前積分</dt>
        <dd>{formatNumber(available)} 點</dd>
      </div>
      <div>
        <dt>{label}</dt>
        <dd>− {formatNumber(amount)} 點</dd>
      </div>
      <div>
        <dt>{label === '本次兌換' ? '兌換' : '投入'}後剩餘</dt>
        <dd>{formatNumber(Math.max(available - amount, 0))} 點</dd>
      </div>
    </dl>
  )
}

function MemberExperienceBonus({ amount }: { amount: number }) {
  const total = investmentXp(amount, true)
  const bonus = total - amount
  return (
    <div className="sp-member-bonus sp-member-bonus--dialog">
      <Badge tone="growth">訂閱會員 +10%</Badge>
      <dl>
        <div>
          <dt>原始培育經驗</dt>
          <dd>{formatNumber(amount)} XP</dd>
        </div>
        <div>
          <dt>會員額外經驗</dt>
          <dd>+ {formatNumber(bonus)} XP</dd>
        </div>
        <div>
          <dt>預計獲得經驗</dt>
          <dd>{formatNumber(total)} XP</dd>
        </div>
      </dl>
    </div>
  )
}
