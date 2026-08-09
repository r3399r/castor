'use client'

import { useState } from 'react'
import { ChevronDown, Coins, Minus, Plus, Sparkles, X } from 'lucide-react'

const guardians = [
  {
    id: 'forest',
    name: '森林守護靈',
    theme: '森林保育',
    level: 2,
    xp: 68,
    nextLevelXp: 100,
  },
  {
    id: 'ocean',
    name: '海洋守護靈',
    theme: '海洋保育',
    level: 1,
    xp: 24,
    nextLevelXp: 50,
  },
]

const demoStates = [
  { id: 'new', label: '尚未兌換', points: 0, hasGuardian: false },
  { id: 'empty', label: '有蛋／0 點', points: 0, hasGuardian: true },
  { id: 'low', label: '不足 8 點', points: 8, hasGuardian: true },
  { id: 'ready', label: '可使用 120 點', points: 120, hasGuardian: true },
] as const

const storeEggs = [
  { id: 'forest', name: '森林之蛋', theme: '森林保育', cost: 20, owned: true },
  { id: 'ocean', name: '海洋之蛋', theme: '海洋保育', cost: 30, owned: true },
  { id: 'animal', name: '毛孩之蛋', theme: '動物救援', cost: 35, owned: false },
  { id: 'warmth', name: '暖光之蛋', theme: '無家者援助', cost: 40, owned: false },
  { id: 'wisdom', name: '智慧之蛋', theme: '教育公益', cost: 45, owned: false },
  { id: 'healing', name: '療癒之蛋', theme: '醫療援助', cost: 50, owned: false },
] as const

const collectionSeries = [
  { id: 'forest', name: '森林守護靈', theme: '森林保育', unlockedLevel: 2 },
  { id: 'ocean', name: '海洋守護靈', theme: '海洋保育', unlockedLevel: 1 },
  { id: 'animal', name: '毛孩守護靈', theme: '動物救援', unlockedLevel: 0 },
] as const

export default function BoxClient() {
  const [activeTab, setActiveTab] = useState<'growing' | 'store' | 'collection'>('growing')
  const [selectedGuardianId, setSelectedGuardianId] = useState(guardians[0].id)
  const [pointsToUse, setPointsToUse] = useState(1)
  const [demoStateId, setDemoStateId] = useState<(typeof demoStates)[number]['id']>('ready')
  const [eggToExchange, setEggToExchange] = useState<(typeof storeEggs)[number] | null>(null)
  const [showInvestDialog, setShowInvestDialog] = useState(false)
  const [collectionPreview, setCollectionPreview] = useState<{
    name: string
    theme: string
    level: number
  } | null>(null)

  const guardian =
    guardians.find((item) => item.id === selectedGuardianId) ?? guardians[0]
  const progress = Math.min((guardian.xp / guardian.nextLevelXp) * 100, 100)
  const demoState = demoStates.find((item) => item.id === demoStateId) ?? demoStates[3]
  const availablePoints = demoState.points

  const changeDemoState = (state: (typeof demoStates)[number]) => {
    setDemoStateId(state.id)
    setPointsToUse(state.points === 0 ? 0 : Math.min(Math.max(pointsToUse, 1), state.points))
  }

  return (
    <div className="pb-16 sm:pb-20">
      <header className="mt-10 sm:mt-[60px]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-blue-700 sm:text-4xl">禮物盒</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-black-500 sm:text-base">
              培育你的守護靈，讓每一次練習累積成一份改變。
            </p>
          </div>

          <div className="flex w-full items-center justify-between gap-4 rounded-2xl border border-brown-300 bg-white px-5 py-4 sm:w-auto sm:min-w-[196px]">
            <div>
              <p className="text-xs text-black-500">目前積分</p>
              <p className="mt-1 text-2xl font-bold text-blue-700">{availablePoints} 點</p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-full bg-beige-200 text-blue-700">
              <Coins size={23} strokeWidth={1.7} aria-hidden="true" />
            </div>
          </div>
        </div>

        <div
          className="mt-8 flex border-b border-brown-300"
          role="tablist"
          aria-label="禮物盒功能"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'growing'}
            onClick={() => setActiveTab('growing')}
            className={`border-b-2 px-4 py-3 text-sm font-bold transition sm:px-7 sm:text-base ${
              activeTab === 'growing'
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-black-500 hover:text-blue-700'
            }`}
          >
            培育中
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'store'}
            onClick={() => setActiveTab('store')}
            className={`border-b-2 px-4 py-3 text-sm font-bold transition sm:px-7 sm:text-base ${
              activeTab === 'store'
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-black-500 hover:text-blue-700'
            }`}
          >
            精靈商店
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'collection'}
            onClick={() => setActiveTab('collection')}
            className={`border-b-2 px-4 py-3 text-sm font-bold transition sm:px-7 sm:text-base ${
              activeTab === 'collection'
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-black-500 hover:text-blue-700'
            }`}
          >
            我的圖鑑
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-dashed border-brown-300 bg-white/60 p-4 sm:flex sm:items-center sm:justify-between sm:gap-5">
          <div>
            <p className="text-sm font-bold text-black-900">Demo 積分狀態</p>
            <p className="mt-1 text-xs text-black-400">僅供預覽，不會變更任何真實資料。</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-0 sm:flex sm:flex-wrap sm:justify-end">
            {demoStates.map((option) => {
              const isActive = demoStateId === option.id

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => changeDemoState(option)}
                  aria-pressed={isActive}
                  className={`min-h-10 rounded-xl border px-3 py-2 text-xs font-bold transition sm:px-4 ${
                    isActive
                      ? 'border-blue-700 bg-blue-700 text-white'
                      : 'border-brown-300 bg-white text-black-500 hover:border-blue-500 hover:text-blue-700'
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>
      </header>

      <main className="mt-8 sm:mt-10">
        {activeTab === 'growing' ? (
          <>
          {demoState.hasGuardian ? (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.12em] text-blue-700 uppercase">
              Growing now
            </p>
            <h2 className="mt-2 text-2xl font-bold text-black-900">正在培育</h2>
          </div>

          <label className="block w-full sm:w-[280px]">
            <span className="mb-2 block text-xs text-black-500">切換守護靈</span>
            <span className="relative block">
              <select
                value={selectedGuardianId}
                onChange={(event) => setSelectedGuardianId(event.target.value)}
                className="h-12 w-full appearance-none rounded-xl border border-brown-300 bg-white px-4 pr-11 text-sm font-medium text-black-900 outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-500/20"
              >
                {guardians.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · Lv.{item.level}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={18}
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-black-500"
              />
            </span>
          </label>
            </div>

            <section className="overflow-hidden rounded-[24px] border border-brown-300 bg-beige-200/50">
          <div className="grid lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
            <div className="flex min-h-[340px] items-center justify-center p-6 sm:min-h-[440px] sm:p-10 lg:min-h-[520px]">
              <div className="flex aspect-square w-full max-w-[400px] items-center justify-center border border-brown-300 bg-white">
                <span className="text-sm text-black-300">蛋／精靈圖片預留位置</span>
              </div>
            </div>

            <div className="border-t border-brown-300 bg-white p-6 sm:p-10 lg:border-t-0 lg:border-l">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-black-500">{guardian.theme}</p>
                  <h3 className="mt-2 text-2xl font-bold text-blue-700 sm:text-3xl">
                    {guardian.name}
                  </h3>
                </div>
                <span className="rounded-full border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm font-bold text-blue-700">
                  Lv. {guardian.level}
                </span>
              </div>

              <p className="mt-6 text-sm leading-6 text-black-500">
                守護靈會隨著你投入的成長經驗逐步升級，並解鎖新的外觀與棲地內容。
              </p>

              <div className="mt-8">
                <div className="mb-3 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-black-900">成長經驗</p>
                    <p className="mt-1 text-xs text-black-500">距離下一階段</p>
                  </div>
                  <p className="text-sm font-bold text-blue-700">
                    {guardian.xp} / {guardian.nextLevelXp} XP
                  </p>
                </div>
                <div
                  className="h-3 overflow-hidden rounded-full bg-beige-300"
                  role="progressbar"
                  aria-label={`${guardian.name}成長經驗`}
                  aria-valuemin={0}
                  aria-valuemax={guardian.nextLevelXp}
                  aria-valuenow={guardian.xp}
                >
                  <div
                    className="h-full rounded-full bg-blue-700 transition-[width] duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-black-400">
                  <span>Lv. {guardian.level}</span>
                  <span>Lv. {guardian.level + 1}</span>
                </div>
              </div>

              <div className="mt-8 rounded-2xl border border-brown-300 bg-beige-100 p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-beige-200 text-blue-700">
                    <Sparkles size={18} strokeWidth={1.8} aria-hidden="true" />
                  </div>
                  <div>
                    <h4 className="font-bold text-black-900">投入積分</h4>
                    <p className="mt-1 text-xs leading-5 text-black-500">
                      選擇要投入的積分，增加這隻守護靈的成長經驗。
                    </p>
                  </div>
                </div>

                {availablePoints === 0 && (
                  <div className="mt-5 rounded-xl border border-brown-300 bg-white px-4 py-3">
                    <p className="text-sm font-bold text-black-900">目前沒有可分配的積分</p>
                    <p className="mt-1 text-xs leading-5 text-black-500">
                      完成更多練習後，就能繼續培育這隻守護靈。
                    </p>
                  </div>
                )}

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <div className="flex h-12 items-center justify-between rounded-xl border border-brown-300 bg-white sm:flex-1">
                    <button
                      type="button"
                      onClick={() => setPointsToUse((value) => Math.max(1, value - 1))}
                      className="flex size-12 items-center justify-center text-black-500 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:text-black-200"
                      disabled={availablePoints === 0 || pointsToUse <= 1}
                      aria-label="減少投入積分"
                    >
                      <Minus size={17} aria-hidden="true" />
                    </button>
                    <label className="flex min-w-0 flex-1 items-center justify-center gap-1">
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

                          if (!Number.isFinite(nextValue)) return
                          setPointsToUse(
                            Math.min(availablePoints, Math.max(0, Math.trunc(nextValue))),
                          )
                        }}
                        onBlur={() => {
                          if (availablePoints > 0 && pointsToUse < 1) setPointsToUse(1)
                        }}
                        className="min-w-0 w-14 appearance-none bg-transparent text-center text-sm font-bold text-black-900 outline-none disabled:text-black-300 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <span className="text-sm font-bold text-black-900">點</span>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setPointsToUse((value) => Math.min(availablePoints, value + 1))
                      }
                      className="flex size-12 items-center justify-center text-black-500 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:text-black-200"
                      disabled={availablePoints === 0 || pointsToUse >= availablePoints}
                      aria-label="增加投入積分"
                    >
                      <Plus size={17} aria-hidden="true" />
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={availablePoints === 0 || pointsToUse < 1}
                    onClick={() => setShowInvestDialog(true)}
                    className="h-12 rounded-xl bg-blue-700 px-6 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-45 sm:flex-1"
                  >
                    確認投入
                  </button>
                </div>
                <p className="mt-3 text-center text-xs text-black-400 sm:text-left">
                  {availablePoints === 0
                    ? '累積積分後即可在這裡選擇投入數量。'
                    : `最多可投入 ${availablePoints} 點；目前為版面示意，不會扣除積分。`}
                </p>
              </div>
            </div>
          </div>
            </section>
          </>
        ) : (
          <>
            <section className="rounded-[24px] border border-brown-300 bg-white p-6 text-center sm:p-10 lg:p-14">
              <div className="mx-auto flex aspect-square w-full max-w-[280px] items-center justify-center border border-brown-300 bg-white sm:max-w-[320px]">
                <span className="text-sm text-black-300">蛋圖片預留位置</span>
              </div>
              <div className="mx-auto mt-8 max-w-xl">
                <p className="text-xs font-bold tracking-[0.12em] text-blue-700 uppercase">
                  Start your journey
                </p>
                <h2 className="mt-3 text-2xl font-bold text-black-900 sm:text-3xl">
                  還沒有正在培育的守護靈
                </h2>
                <p className="mt-4 text-sm leading-7 text-black-500 sm:text-base">
                  完成題目累積積分，兌換第一顆蛋，開始培育你的守護靈。
                </p>
                <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                  <a
                    href="/question"
                    className="inline-flex h-12 items-center justify-center rounded-xl bg-blue-700 px-7 text-sm font-bold text-white transition hover:bg-blue-500"
                  >
                    前往練習
                  </a>
                  <button
                    type="button"
                    onClick={() => setActiveTab('store')}
                    className="inline-flex h-12 items-center justify-center rounded-xl border border-brown-300 bg-white px-7 text-sm font-bold text-black-700 transition hover:border-blue-500 hover:text-blue-700"
                  >
                    看看精靈商店
                  </button>
                </div>
              </div>
            </section>

            <section className="mt-8 rounded-[24px] border border-brown-300 bg-beige-200/50 p-6 sm:p-8 lg:p-10">
              <div className="text-center">
                <p className="text-xs font-bold tracking-[0.12em] text-blue-700 uppercase">
                  How it works
                </p>
                <h2 className="mt-2 text-xl font-bold text-black-900 sm:text-2xl">
                  培育守護靈的旅程
                </h2>
              </div>
              <ol className="mt-8 grid gap-3 sm:grid-cols-5 sm:gap-2">
                {[
                  ['01', '完成練習', '完成題目並累積學習成果'],
                  ['02', '累積積分', '把每次練習轉換成可使用的積分'],
                  ['03', '兌換蛋', '在精靈商店選擇喜歡的守護靈'],
                  ['04', '培育守護靈', '投入積分，解鎖不同成長階段'],
                  ['05', '解鎖公益支持', '滿級後支持相應主題的公益計畫'],
                ].map(([number, title, description], index) => (
                  <li
                    key={number}
                    className="relative rounded-2xl border border-brown-300 bg-white p-5 text-left sm:min-h-[190px] sm:p-4"
                  >
                    <span className="text-xs font-bold text-blue-500">STEP {number}</span>
                    <h3 className="mt-4 font-bold text-black-900">{title}</h3>
                    <p className="mt-2 text-xs leading-5 text-black-500">{description}</p>
                    {index < 4 && (
                      <span
                        aria-hidden="true"
                        className="absolute -bottom-3 left-1/2 z-10 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border border-brown-300 bg-beige-100 text-black-400 sm:top-1/2 sm:-right-4 sm:bottom-auto sm:left-auto sm:-translate-y-1/2"
                      >
                        →
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}

        <section className="mt-8 rounded-[24px] border border-brown-300 bg-white p-6 sm:p-8">
          <p className="text-xs font-bold tracking-[0.12em] text-blue-700 uppercase">
            Learning for good
          </p>
          <h2 className="mt-2 text-xl font-bold text-black-900 sm:text-2xl">
            讓學習成果，成為一份真實的支持
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-black-500">
            當一隻守護靈完成最高階段的培育後，平台預計以自有資金提撥新台幣 10
            元，支持與該守護靈主題相關的公益機構。實際受贈機構、捐款時間與執行方式，將依當期公益計畫及合作條件為準。
          </p>
          <p className="mt-4 border-t border-brown-300 pt-4 text-xs leading-6 text-black-400">
            本活動中的積分與培育行為不等同於使用者直接捐款，亦不提供捐款收據或稅務抵扣憑證。每月提撥總額以新台幣
            5,000
            元為上限；詳細執行方式與公益紀錄將依正式活動辦法公告。當月達到提撥上限後，後續完成的公益進度將累計至下一期，不影響守護靈升級與圖鑑解鎖。
          </p>
        </section>
          </>
        ) : activeTab === 'store' ? (
          <section>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold tracking-[0.12em] text-blue-700 uppercase">
                  Guardian shop
                </p>
                <h2 className="mt-2 text-2xl font-bold text-black-900">選擇一顆守護靈之蛋</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-black-500">
                  使用練習累積的積分兌換蛋，選擇你想支持的公益主題，開始一段新的培育旅程。
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-brown-300 bg-white px-5 py-4">
                <Coins size={21} strokeWidth={1.7} className="text-blue-700" aria-hidden="true" />
                <div>
                  <p className="text-xs text-black-500">可使用積分</p>
                  <p className="mt-0.5 text-xl font-bold text-blue-700">{availablePoints} 點</p>
                </div>
              </div>
            </div>

            {availablePoints === 0 && (
              <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-brown-300 bg-beige-200/60 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div>
                  <p className="font-bold text-black-900">目前還沒有可使用的積分</p>
                  <p className="mt-1 text-sm leading-6 text-black-500">
                    商品仍可先瀏覽。完成練習累積積分後，就能回來兌換喜歡的蛋。
                  </p>
                </div>
                <a
                  href="/question"
                  className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-blue-700 px-6 text-sm font-bold text-white transition hover:bg-blue-500"
                >
                  前往練習
                </a>
              </div>
            )}

            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {storeEggs.map((egg) => {
                const pointsNeeded = Math.max(egg.cost - availablePoints, 0)
                const canAfford = availablePoints >= egg.cost
                const isOwned = egg.owned && demoState.hasGuardian

                return (
                  <article
                    key={egg.id}
                    className="flex flex-col overflow-hidden rounded-[24px] border border-brown-300 bg-white"
                  >
                    <div className="bg-beige-200/50 p-5 sm:p-6">
                      <div className="mx-auto flex aspect-square w-full max-w-[240px] items-center justify-center border border-brown-300 bg-white">
                        <span className="text-sm text-black-300">蛋圖片預留位置</span>
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col p-5 sm:p-6">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-black-500">{egg.theme}</p>
                          <h3 className="mt-1 text-xl font-bold text-black-900">{egg.name}</h3>
                        </div>
                        {isOwned && (
                          <span className="shrink-0 rounded-full bg-beige-200 px-3 py-1 text-xs font-bold text-black-500">
                            已擁有
                          </span>
                        )}
                      </div>
                      <p className="mt-4 text-sm leading-6 text-black-500">
                        孵化並培育這顆蛋，逐步解鎖守護靈與牠的專屬棲地。
                      </p>

                      <div className="mt-auto pt-6">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-xs text-black-500">兌換所需</span>
                          <span className="flex items-center gap-1.5 text-lg font-bold text-blue-700">
                            <Coins size={17} strokeWidth={1.8} aria-hidden="true" />
                            {egg.cost} 點
                          </span>
                        </div>

                        {!isOwned && !canAfford && (
                          <div className="mb-3">
                            <div className="h-1.5 overflow-hidden rounded-full bg-beige-300">
                              <div
                                className="h-full rounded-full bg-blue-500"
                                style={{ width: `${Math.min((availablePoints / egg.cost) * 100, 100)}%` }}
                              />
                            </div>
                            <p className="mt-2 text-xs text-black-400">還差 {pointsNeeded} 點</p>
                          </div>
                        )}

                        <button
                          type="button"
                          disabled={isOwned || !canAfford}
                          onClick={() => setEggToExchange(egg)}
                          className={`h-11 w-full rounded-xl text-sm font-bold transition ${
                            isOwned
                              ? 'cursor-not-allowed border border-brown-300 bg-beige-100 text-black-400'
                              : canAfford
                                ? 'bg-blue-700 text-white hover:bg-blue-500'
                                : 'cursor-not-allowed bg-beige-300 text-black-400'
                          }`}
                        >
                          {isOwned ? '已擁有' : canAfford ? '兌換' : '積分不足'}
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>

            <div className="mt-8 rounded-2xl border border-brown-300 bg-white p-5 sm:p-6">
              <p className="text-sm font-bold text-black-900">兌換前請留意</p>
              <p className="mt-2 text-xs leading-6 text-black-500">
                目前為前端版面示意，商品價格與積分規則尚未定案。所有兌換按鈕皆不會扣除積分或建立守護靈。
              </p>
            </div>
          </section>
        ) : (
          <section>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold tracking-[0.12em] text-blue-700 uppercase">
                  My collection
                </p>
                <h2 className="mt-2 text-2xl font-bold text-black-900">我的守護靈圖鑑</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-black-500">
                  收藏每一隻守護靈的成長足跡。已解鎖的階段可以點擊放大查看。
                </p>
              </div>
              <div className="rounded-2xl border border-brown-300 bg-white px-5 py-4 sm:min-w-[190px]">
                <p className="text-xs text-black-500">已解鎖圖鑑</p>
                <p className="mt-1 text-2xl font-bold text-blue-700">
                  {demoState.hasGuardian ? 3 : 0}
                  <span className="ml-1 text-sm font-normal text-black-400">/ 15</span>
                </p>
              </div>
            </div>

            {!demoState.hasGuardian && (
              <div className="mt-6 rounded-[24px] border border-brown-300 bg-white p-6 text-center sm:p-10">
                <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-beige-200 text-blue-700">
                  <Sparkles size={26} strokeWidth={1.6} aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-xl font-bold text-black-900">你的圖鑑還是空的</h3>
                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-black-500">
                  兌換並培育守護靈後，每個解鎖的成長階段都會收藏在這裡。
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('store')}
                  className="mt-6 h-12 rounded-xl bg-blue-700 px-7 text-sm font-bold text-white transition hover:bg-blue-500"
                >
                  前往精靈商店
                </button>
              </div>
            )}

            <div className="mt-8 space-y-8">
              {collectionSeries.map((series) => {
                const unlockedLevel = demoState.hasGuardian ? series.unlockedLevel : 0

                return (
                  <section
                    key={series.id}
                    className="rounded-[24px] border border-brown-300 bg-white p-5 sm:p-7"
                  >
                    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-brown-300 pb-5">
                      <div>
                        <p className="text-xs text-black-500">{series.theme}</p>
                        <h3 className="mt-1 text-xl font-bold text-black-900">{series.name}</h3>
                      </div>
                      <p className="text-sm font-bold text-blue-700">已解鎖 {unlockedLevel} / 5</p>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
                      {[1, 2, 3, 4, 5].map((level) => {
                        const isUnlocked = level <= unlockedLevel

                        return (
                          <button
                            key={level}
                            type="button"
                            disabled={!isUnlocked}
                            onClick={() =>
                              setCollectionPreview({
                                name: series.name,
                                theme: series.theme,
                                level,
                              })
                            }
                            className={`group overflow-hidden rounded-2xl border text-left transition ${
                              isUnlocked
                                ? 'border-brown-300 bg-white hover:-translate-y-0.5 hover:border-blue-500 hover:shadow-md'
                                : 'cursor-not-allowed border-brown-300 bg-beige-200/60'
                            }`}
                          >
                            <span
                              className={`relative flex aspect-square items-center justify-center border-b border-brown-300 ${
                                isUnlocked ? 'bg-white' : 'bg-beige-200'
                              }`}
                            >
                              {isUnlocked ? (
                                <span className="text-xs text-black-300">精靈圖片位置</span>
                              ) : (
                                <span className="flex size-9 items-center justify-center rounded-full border border-brown-300 bg-beige-100 text-sm text-black-400">
                                  🔒
                                </span>
                              )}
                            </span>
                            <span className="block p-3">
                              <span
                                className={`block text-sm font-bold ${isUnlocked ? 'text-black-900' : 'text-black-400'}`}
                              >
                                Lv. {level}
                              </span>
                              <span className="mt-1 block text-xs text-black-400">
                                {isUnlocked ? '已解鎖 · 點擊查看' : '尚未解鎖'}
                              </span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </div>

            <div className="mt-8 rounded-2xl border border-brown-300 bg-beige-200/50 p-5 sm:p-6">
              <p className="text-sm font-bold text-black-900">圖鑑會持續成長</p>
              <p className="mt-2 text-xs leading-6 text-black-500">
                每當守護靈升到新的階段，對應的角色與棲地圖片就會永久收入圖鑑。圖片與解鎖內容目前皆為 Demo。
              </p>
            </div>
          </section>
        )}
      </main>

      {eggToExchange && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black-900/45 p-0 sm:items-center sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEggToExchange(null)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="exchange-dialog-title"
            className="w-full rounded-t-[24px] border border-brown-300 bg-beige-100 p-6 shadow-2xl sm:max-w-[480px] sm:rounded-[24px] sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold tracking-[0.12em] text-blue-700 uppercase">
                  Confirm exchange
                </p>
                <h2
                  id="exchange-dialog-title"
                  className="mt-2 text-xl font-bold text-black-900 sm:text-2xl"
                >
                  確定要兌換這顆蛋嗎？
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEggToExchange(null)}
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-black-500 transition hover:bg-beige-200 hover:text-black-900"
                aria-label="關閉確認視窗"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-6 flex items-center gap-4 rounded-2xl border border-brown-300 bg-white p-4">
              <div className="flex size-20 shrink-0 items-center justify-center border border-brown-300 bg-white">
                <span className="text-[10px] text-black-300">圖片位置</span>
              </div>
              <div>
                <p className="text-xs text-black-500">{eggToExchange.theme}</p>
                <p className="mt-1 text-lg font-bold text-black-900">{eggToExchange.name}</p>
                <p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-blue-700">
                  <Coins size={16} strokeWidth={1.8} aria-hidden="true" />
                  將使用 {eggToExchange.cost} 點
                </p>
              </div>
            </div>

            <dl className="mt-4 divide-y divide-brown-300 rounded-2xl border border-brown-300 bg-white px-5">
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-sm text-black-500">目前積分</dt>
                <dd className="text-sm font-bold text-black-900">{availablePoints} 點</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-sm text-black-500">本次兌換</dt>
                <dd className="text-sm font-bold text-black-900">− {eggToExchange.cost} 點</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-sm font-bold text-black-900">兌換後剩餘</dt>
                <dd className="text-lg font-bold text-blue-700">
                  {Math.max(availablePoints - eggToExchange.cost, 0)} 點
                </dd>
              </div>
            </dl>

            <p className="mt-4 text-xs leading-5 text-black-400">
              目前為前端 Demo，確認後不會實際扣除積分或新增守護靈。
            </p>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setEggToExchange(null)}
                className="h-12 rounded-xl border border-brown-300 bg-white px-6 text-sm font-bold text-black-700 transition hover:border-blue-500 hover:text-blue-700 sm:min-w-[120px]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => setEggToExchange(null)}
                className="h-12 rounded-xl bg-blue-700 px-6 text-sm font-bold text-white transition hover:bg-blue-500 sm:min-w-[140px]"
              >
                確認兌換
              </button>
            </div>
          </div>
        </div>
      )}

      {showInvestDialog && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black-900/45 p-0 sm:items-center sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowInvestDialog(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="invest-dialog-title"
            className="w-full rounded-t-[24px] border border-brown-300 bg-beige-100 p-6 shadow-2xl sm:max-w-[480px] sm:rounded-[24px] sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold tracking-[0.12em] text-blue-700 uppercase">
                  Confirm growth
                </p>
                <h2
                  id="invest-dialog-title"
                  className="mt-2 text-xl font-bold text-black-900 sm:text-2xl"
                >
                  確定要投入積分嗎？
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowInvestDialog(false)}
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-black-500 transition hover:bg-beige-200 hover:text-black-900"
                aria-label="關閉確認視窗"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-6 rounded-2xl border border-brown-300 bg-white p-5">
              <p className="text-xs text-black-500">培育對象</p>
              <p className="mt-1 text-lg font-bold text-black-900">{guardian.name}</p>
            </div>

            <dl className="mt-4 divide-y divide-brown-300 rounded-2xl border border-brown-300 bg-white px-5">
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-sm text-black-500">目前積分</dt>
                <dd className="text-sm font-bold text-black-900">{availablePoints} 點</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-sm text-black-500">本次投入</dt>
                <dd className="text-sm font-bold text-black-900">− {pointsToUse} 點</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-sm font-bold text-black-900">投入後剩餘</dt>
                <dd className="flex items-center gap-1.5 text-lg font-bold text-blue-700">
                  <Coins size={17} strokeWidth={1.8} aria-hidden="true" />
                  {Math.max(availablePoints - pointsToUse, 0)} 點
                </dd>
              </div>
            </dl>

            <p className="mt-4 text-xs leading-5 text-black-400">
              目前為前端 Demo，確認後不會實際扣除積分或增加成長經驗。
            </p>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowInvestDialog(false)}
                className="h-12 rounded-xl border border-brown-300 bg-white px-6 text-sm font-bold text-black-700 transition hover:border-blue-500 hover:text-blue-700 sm:min-w-[120px]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => setShowInvestDialog(false)}
                className="h-12 rounded-xl bg-blue-700 px-6 text-sm font-bold text-white transition hover:bg-blue-500 sm:min-w-[140px]"
              >
                確認投入
              </button>
            </div>
          </div>
        </div>
      )}

      {collectionPreview && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black-900/45 p-0 sm:items-center sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCollectionPreview(null)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="collection-dialog-title"
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-[24px] border border-brown-300 bg-beige-100 p-6 shadow-2xl sm:max-w-[620px] sm:rounded-[24px] sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-black-500">{collectionPreview.theme}</p>
                <h2
                  id="collection-dialog-title"
                  className="mt-1 text-xl font-bold text-black-900 sm:text-2xl"
                >
                  {collectionPreview.name} · Lv. {collectionPreview.level}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCollectionPreview(null)}
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-black-500 transition hover:bg-beige-200 hover:text-black-900"
                aria-label="關閉圖鑑圖片"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="mx-auto mt-6 flex aspect-square w-full max-w-[480px] items-center justify-center border border-brown-300 bg-white">
              <span className="text-sm text-black-300">精靈大圖預留位置</span>
            </div>
            <p className="mt-5 text-sm leading-6 text-black-500">
              這是守護靈第 {collectionPreview.level} 階段的收藏圖片。正式角色圖與階段故事將在美術內容確認後補上。
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
