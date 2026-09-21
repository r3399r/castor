/** Existing UI demonstration values; no API or reward calculations. */
export const guardians = [
  {
    id: 'forest',
    name: '森林精靈',
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
    name: '海洋精靈',
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
  {
    id: 'children',
    name: '暖陽之蛋',
    theme: '兒少、家庭與婦幼',
    cost: 20,
    owned: false,
  },
  {
    id: 'neurodevelopment',
    name: '星光之蛋',
    theme: '身心障礙與神經發展',
    cost: 25,
    owned: false,
  },
  {
    id: 'eldercare',
    name: '長青之蛋',
    theme: '高齡長照與失智照護',
    cost: 30,
    owned: false,
  },
  {
    id: 'healthcare',
    name: '療癒之蛋',
    theme: '疾病醫療、心理與善終',
    cost: 35,
    owned: false,
  },
  {
    id: 'rights',
    name: '共鳴之蛋',
    theme: '人權、法治、性別與社區',
    cost: 40,
    owned: false,
  },
  {
    id: 'wisdom',
    name: '智慧之蛋',
    theme: '教育翻轉、人文與藝術',
    cost: 45,
    owned: false,
  },
  {
    id: 'forest',
    name: '森林之蛋',
    theme: '生態環境與動物福利',
    cost: 50,
    owned: true,
  },
] as const

export const collectionSeries = [
  {
    id: 'children',
    name: '貓精靈',
    theme: '兒少、家庭與婦幼',
    unlockedLevel: 0,
  },
  {
    id: 'neurodevelopment',
    name: '水獺精靈',
    theme: '身心障礙與神經發展',
    unlockedLevel: 0,
  },
  {
    id: 'eldercare',
    name: '狗精靈',
    theme: '高齡長照與失智照護',
    unlockedLevel: 0,
  },
  {
    id: 'healthcare',
    name: '兔子精靈',
    theme: '疾病醫療、心理與善終',
    unlockedLevel: 0,
  },
  {
    id: 'rights',
    name: '海豚精靈',
    theme: '人權、法治、性別與社區',
    unlockedLevel: 0,
  },
  {
    id: 'wisdom',
    name: '彩羽鳥靈',
    theme: '教育翻轉、人文與藝術',
    unlockedLevel: 1,
  },
  {
    id: 'forest',
    name: '森林鹿靈',
    theme: '生態環境與動物福利',
    unlockedLevel: 2,
  },
] as const
