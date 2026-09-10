/** Existing UI demonstration values; no API or reward calculations. */
export const guardians = [
  {
    id: 'forest',
    name: '森林守護靈',
    theme: '森林保育',
    level: 2,
    xp: 68,
    nextLevelXp: 100,
  },
  {
    id: 'wisdom',
    name: '彩羽鳥靈',
    theme: '教育翻轉、人文與藝術',
    level: 1,
    xp: 24,
    nextLevelXp: 50,
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

export const demoStates = [
  { id: 'new', label: '尚未兌換', points: 0, hasGuardian: false },
  { id: 'empty', label: '有蛋／0 點', points: 0, hasGuardian: true },
  { id: 'low', label: '不足 8 點', points: 8, hasGuardian: true },
  { id: 'ready', label: '可使用 120 點', points: 120, hasGuardian: true },
  { id: 'complete', label: '已完成 LV5', points: 120, hasGuardian: true },
] as const

export const storeEggs = [
  { id: 'forest', name: '森林之蛋', theme: '森林保育', cost: 20, owned: true },
  { id: 'ocean', name: '海洋之蛋', theme: '海洋保育', cost: 30, owned: true },
  { id: 'animal', name: '毛孩之蛋', theme: '動物救援', cost: 35, owned: false },
  {
    id: 'warmth',
    name: '暖光之蛋',
    theme: '無家者援助',
    cost: 40,
    owned: false,
  },
  { id: 'wisdom', name: '智慧之蛋', theme: '教育公益', cost: 45, owned: false },
  {
    id: 'healing',
    name: '療癒之蛋',
    theme: '醫療援助',
    cost: 50,
    owned: false,
  },
] as const

export const collectionSeries = [
  { id: 'forest', name: '森林守護靈', theme: '森林保育', unlockedLevel: 2 },
  { id: 'ocean', name: '海洋守護靈', theme: '海洋保育', unlockedLevel: 1 },
  {
    id: 'wisdom',
    name: '彩羽鳥靈',
    theme: '教育翻轉、人文與藝術',
    unlockedLevel: 1,
  },
  { id: 'animal', name: '毛孩守護靈', theme: '動物救援', unlockedLevel: 0 },
] as const
