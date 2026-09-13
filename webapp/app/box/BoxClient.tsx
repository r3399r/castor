'use client'

import { useState } from 'react'
import {
  BookOpen,
  Check,
  ChevronDown,
  Coins,
  LockKeyhole,
  Minus,
  Plus,
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
import { spiritCatalog, type SpiritSpecies } from '@/lib/guardianArtwork'
import { collectionSeries, demoStates, guardians, storeEggs } from './demoData'
import SupportNote from './SupportNote'

// Artwork mapping is deliberately separate from existing demo/API identifiers.
// The old ocean demo has no matching artwork; never represent it as a bird.
const artworkById: Partial<Record<string, SpiritSpecies>> = {
  forest: 'deer',
  wisdom: 'bird',
}
// Feature the available artwork without removing or changing demo products.
const illustratedFirst = (a: { id: string }, b: { id: string }) =>
  Number(Boolean(artworkById[b.id])) - Number(Boolean(artworkById[a.id]))
const displayedEggs = [...storeEggs].sort(illustratedFirst)
const displayedCollection = [...collectionSeries].sort(illustratedFirst)
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
  ['兌換蛋', '在精靈商店選擇喜歡的守護靈'],
  ['培育守護靈', '投入積分，解鎖不同成長階段'],
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
  const [activeTab, setActiveTab] = useState<
    'growing' | 'store' | 'collection'
  >('growing')
  const [selectedGuardianId, setSelectedGuardianId] = useState(guardians[0].id)
  const [pointsToUse, setPointsToUse] = useState(1)
  const [demoStateId, setDemoStateId] =
    useState<(typeof demoStates)[number]['id']>('ready')
  const [eggToExchange, setEggToExchange] = useState<
    (typeof storeEggs)[number] | null
  >(null)
  const [showInvestDialog, setShowInvestDialog] = useState(false)
  const [collectionPreview, setCollectionPreview] = useState<{
    name: string
    theme: string
    level: number
    species?: SpiritSpecies
  } | null>(null)
  const [previewLevel, setPreviewLevel] = useState<number | null>(null)
  const guardian =
    guardians.find((item) => item.id === selectedGuardianId) ?? guardians[0]
  const species = artworkById[guardian.id]
  const demoState =
    demoStates.find((item) => item.id === demoStateId) ?? demoStates[3]
  const availablePoints = demoState.points
  const complete = demoStateId === 'complete'
  const level = complete ? 5 : guardian.level
  const shownLevel = previewLevel ?? level
  const changeDemoState = (state: (typeof demoStates)[number]) => {
    setDemoStateId(state.id)
    setPreviewLevel(null)
    setPointsToUse(
      state.points === 0 ? 0 : Math.min(Math.max(pointsToUse, 1), state.points),
    )
  }
  const investControls = (
    <div className="sp-invest">
      <div className="sp-invest-title">
        <Sparkles size={18} aria-hidden="true" />
        <h3>投入積分</h3>
      </div>
      <p className="sp-description">
        選擇要投入的積分，增加這隻守護靈的成長經驗。
      </p>
      {availablePoints === 0 && (
        <p className="sp-inline-notice">
          目前沒有可分配的積分。完成更多練習後，就能繼續培育這隻守護靈。
        </p>
      )}
      <div className="sp-invest-controls">
        <div className="sp-stepper">
          <Button
            variant="quiet"
            onClick={() => setPointsToUse((value) => Math.max(1, value - 1))}
            disabled={availablePoints === 0 || pointsToUse <= 1}
            aria-label="減少投入積分"
          >
            <Minus size={17} aria-hidden="true" />
          </Button>
          <label>
            <span className="sr-only">投入積分點數</span>
            <input
              type="number"
              inputMode="numeric"
              min={availablePoints === 0 ? 0 : 1}
              max={availablePoints}
              value={pointsToUse}
              disabled={availablePoints === 0}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => {
                const nextValue = Number(event.target.value)
                if (Number.isFinite(nextValue))
                  setPointsToUse(
                    Math.min(
                      availablePoints,
                      Math.max(0, Math.trunc(nextValue)),
                    ),
                  )
              }}
              onBlur={() => {
                if (availablePoints > 0 && pointsToUse < 1) setPointsToUse(1)
              }}
            />
            <span>點</span>
          </label>
          <Button
            variant="quiet"
            onClick={() =>
              setPointsToUse((value) => Math.min(availablePoints, value + 1))
            }
            disabled={availablePoints === 0 || pointsToUse >= availablePoints}
            aria-label="增加投入積分"
          >
            <Plus size={17} aria-hidden="true" />
          </Button>
        </div>
        <Button
          onClick={() => setShowInvestDialog(true)}
          disabled={availablePoints === 0 || pointsToUse < 1}
        >
          <Sparkles size={16} aria-hidden="true" />
          確認投入
        </Button>
      </div>
      <p className="sp-caption">
        {availablePoints === 0
          ? '累積積分後即可在這裡選擇投入數量。'
          : `最多可投入 ${availablePoints} 點；目前為版面示意，不會扣除積分。`}
      </p>
    </div>
  )

  const guardianSelector = (
    <label className="sp-select sp-guardian-selector">
      <span>切換守護靈</span>
      <span className="sp-select-control">
        <select
          value={selectedGuardianId}
          onChange={(event) => {
            setSelectedGuardianId(event.target.value)
            setPreviewLevel(null)
          }}
        >
          {guardians.map((item) => (
            <option key={item.id} value={item.id}>
              {artworkById[item.id]
                ? spiritCatalog[artworkById[item.id]!].name
                : item.name}{' '}
              · LV{complete ? 5 : item.level}
            </option>
          ))}
        </select>
        <ChevronDown size={16} aria-hidden="true" />
      </span>
    </label>
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
              src="/images/points-vine-top-left.png"
              alt=""
              aria-hidden="true"
              draggable={false}
              width={360}
              height={290}
            />
            <img
              className="sp-points-vine sp-points-vine-bottom"
              src="/images/points-vine-bottom-right.png"
              alt=""
              aria-hidden="true"
              draggable={false}
              width={820}
              height={340}
            />
            <div className="sp-points-copy">
              <p>目前積分</p>
              <strong>
                {availablePoints.toLocaleString()}
                <span> 點</span>
              </strong>
            </div>
          </Card>
        }
      >
        <h1>
          禮物盒<span>讓學習，慢慢長成美好。</span>
        </h1>
      </IllustratedHero>
      <div className="sp-box-content">
        <Tabs
          id="gift-tabs"
          label="禮物盒功能"
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
          {activeTab === 'growing' ? (
            <>
              {demoState.hasGuardian ? (
                <>
                  <div className="sp-growing-layout">
                    <div className="sp-companion-art">
                      {species ? (
                        <SpiritScene
                          species={species}
                          level={shownLevel}
                          priority
                          caption={
                            shownLevel !== level
                              ? `LV${shownLevel} · 成長外觀預覽${shownLevel > level ? '，尚未解鎖' : ''}`
                              : `LV${level} · ${spiritCatalog[species].stages[level - 1]} — 每一份努力，都在悄悄生長`
                          }
                        />
                      ) : (
                        <ArtworkPlaceholder />
                      )}
                    </div>
                    {species ? (
                      <SpiritStatusCard
                        headerAction={guardianSelector}
                        species={species}
                        level={level}
                        xp={guardian.xp}
                        nextLevelXp={complete ? null : guardian.nextLevelXp}
                      >
                        {complete ? (
                          <RewardBanner title="守護靈已完成培育">
                            LV1～LV5 的成長足跡，已收入你的圖鑑。
                            <Button
                              variant="secondary"
                              onClick={() => setActiveTab('collection')}
                            >
                              查看我的圖鑑
                            </Button>
                          </RewardBanner>
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
                          守護靈會隨著你投入的成長經驗逐步升級，並解鎖新的外觀與棲地內容。
                        </p>
                        <Progress
                          label="成長經驗"
                          value={complete ? 1 : guardian.xp}
                          max={complete ? 1 : guardian.nextLevelXp}
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
                  {species && (
                    <ContentPanel className="sp-journey">
                      <div className="sp-section-heading">
                        <h2>成長進度</h2>
                      </div>
                      <GrowthTrack
                        species={species}
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
                    title="還沒有正在培育的守護靈"
                    action={
                      <>
                        <a
                          href="/question"
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
                    完成題目累積積分，兌換第一顆蛋，開始培育你的守護靈。
                  </IllustratedEmptyState>
                  <ContentPanel className="sp-how">
                    <p className="sp-eyebrow">HOW IT WORKS</p>
                    <h2>培育守護靈的旅程</h2>
                    <ol>
                      {steps.map(([title, description], index) => (
                        <li key={title}>
                          <span>0{index + 1}</span>
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
                  <h2>選擇一顆守護靈之蛋</h2>
                  <p className="sp-description">
                    使用練習累積的積分兌換蛋，選擇你想支持的公益主題，開始一段新的培育旅程。
                  </p>
                </div>
                <Badge tone="growth">
                  <Coins size={16} aria-hidden="true" />
                  可使用 {availablePoints} 點
                </Badge>
              </div>
              {availablePoints === 0 && (
                <RewardBanner title="目前還沒有可使用的積分">
                  商品仍可先瀏覽。完成練習累積積分後，就能回來兌換喜歡的蛋。
                  <a href="/question" className="sp-text-link">
                    前往練習 →
                  </a>
                </RewardBanner>
              )}
              <div className="sp-store-grid">
                {displayedEggs.map((egg) => {
                  const pointsNeeded = Math.max(egg.cost - availablePoints, 0)
                  const canAfford = availablePoints >= egg.cost
                  const isOwned = egg.owned && demoState.hasGuardian
                  const art = artworkById[egg.id]
                  return (
                    <Card key={egg.id} className="sp-store-card">
                      <div className="sp-store-art">
                        {art ? (
                          <SpiritArtwork species={art} level={1} />
                        ) : (
                          <ArtworkPlaceholder />
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
                          孵化並培育這顆蛋，逐步解鎖守護靈與牠的專屬棲地。
                        </p>
                        <div className="sp-store-purchase">
                          <div className="sp-progress-heading">
                            <span>兌換所需</span>
                            <strong>
                              <Coins size={16} aria-hidden="true" />
                              {egg.cost} 點
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
                                還差 {pointsNeeded} 點
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
              <ContentPanel className="sp-note">
                <h3>兌換前請留意</h3>
                <p>
                  目前為前端版面示意，商品價格與積分規則尚未定案。所有兌換按鈕皆不會扣除積分或建立守護靈。
                </p>
              </ContentPanel>
            </>
          ) : (
            <>
              <div className="sp-section-heading">
                <div>
                  <p className="sp-eyebrow">THE GROWTH COLLECTION</p>
                  <h2>我的守護靈圖鑑</h2>
                  <p className="sp-description">
                    收藏每一隻守護靈的成長足跡。已解鎖的階段可以點擊放大查看。
                  </p>
                </div>
                <Badge tone="growth">
                  已解鎖圖鑑{' '}
                  {demoState.hasGuardian
                    ? collectionSeries.reduce(
                        (sum, series) =>
                          sum + (complete ? 5 : series.unlockedLevel),
                        0,
                      )
                    : 0}{' '}
                  / {collectionSeries.length * 5}
                </Badge>
              </div>
              {!demoState.hasGuardian && (
                <IllustratedEmptyState
                  title="你的圖鑑還是空的"
                  species="bird"
                  action={
                    <Button onClick={() => setActiveTab('store')}>
                      前往精靈商店
                    </Button>
                  }
                >
                  兌換並培育守護靈後，每個解鎖的成長階段都會收藏在這裡。
                </IllustratedEmptyState>
              )}
              {displayedCollection.map((series) => {
                const unlockedLevel = demoState.hasGuardian
                  ? complete
                    ? 5
                    : series.unlockedLevel
                  : 0
                const art = artworkById[series.id]
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
                                  src="/images/locked-egg.png"
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
              <ContentPanel className="sp-note">
                <h3>圖鑑會持續成長</h3>
                <p>
                  每當守護靈升到新的階段，對應的角色與棲地圖片就會永久收入圖鑑。圖片與解鎖內容目前皆為
                  Demo。
                </p>
              </ContentPanel>
            </>
          )}
        </main>
        <details className="sp-demo">
          <summary>版面預覽設定 · Demo 積分狀態</summary>
          <p>僅供預覽，不會變更任何真實資料。</p>
          <div>
            {demoStates.map((option) => (
              <Button
                key={option.id}
                variant="secondary"
                aria-pressed={demoStateId === option.id}
                onClick={() => changeDemoState(option)}
              >
                {demoStateId === option.id && (
                  <Check size={14} aria-hidden="true" />
                )}
                {option.label}
              </Button>
            ))}
          </div>
        </details>
      </div>
      {eggToExchange && (
        <Modal
          title="確定要兌換這顆蛋嗎？"
          onClose={() => setEggToExchange(null)}
        >
          <div className="sp-dialog-item">
            <div>
              {artworkById[eggToExchange.id] ? (
                <SpiritArtwork
                  species={artworkById[eggToExchange.id]!}
                  level={1}
                />
              ) : (
                <ArtworkPlaceholder />
              )}
            </div>
            <div>
              <p className="sp-eyebrow">{eggToExchange.theme}</p>
              <h3>{eggToExchange.name}</h3>
              <p>將使用 {eggToExchange.cost} 點</p>
            </div>
          </div>
          <TransactionSummary
            available={availablePoints}
            amount={eggToExchange.cost}
            label="本次兌換"
          />
          <p className="sp-caption">
            目前為前端 Demo，確認後不會實際扣除積分或新增守護靈。
          </p>
          <div className="sp-dialog-actions">
            <Button variant="secondary" onClick={() => setEggToExchange(null)}>
              取消
            </Button>
            <Button onClick={() => setEggToExchange(null)}>確認兌換</Button>
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
            <h3>{species ? spiritCatalog[species].name : guardian.name}</h3>
          </Card>
          <TransactionSummary
            available={availablePoints}
            amount={pointsToUse}
            label="本次投入"
          />
          <p className="sp-caption">
            目前為前端 Demo，確認後不會實際扣除積分或增加成長經驗。
          </p>
          <div className="sp-dialog-actions">
            <Button
              variant="secondary"
              onClick={() => setShowInvestDialog(false)}
            >
              取消
            </Button>
            <Button onClick={() => setShowInvestDialog(false)}>確認投入</Button>
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
          <p className="sp-description">
            這是守護靈第 {collectionPreview.level}{' '}
            階段的收藏圖片。正式角色圖與階段故事將在美術內容確認後補上。
          </p>
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
        <dd>{available} 點</dd>
      </div>
      <div>
        <dt>{label}</dt>
        <dd>− {amount} 點</dd>
      </div>
      <div>
        <dt>{label === '本次兌換' ? '兌換' : '投入'}後剩餘</dt>
        <dd>{Math.max(available - amount, 0)} 點</dd>
      </div>
    </dl>
  )
}
