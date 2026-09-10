/** Presentation-only catalog. Keys do not replace backend species identifiers. */
export type SpiritSpecies =
  | 'cat'
  | 'otter'
  | 'dog'
  | 'rabbit'
  | 'dolphin'
  | 'bird'
  | 'deer'
export type SpiritDefinition = {
  name: string
  category: string
  artwork?: string
  tone: 'forest' | 'sky'
  stages: readonly string[]
}
export const spiritCatalog: Record<SpiritSpecies, SpiritDefinition> = {
  cat: {
    name: '貓守護靈',
    category: '兒少、家庭與婦幼',
    tone: 'forest',
    stages: [],
  },
  otter: {
    name: '水獺守護靈',
    category: '身心障礙與神經發展',
    tone: 'sky',
    stages: [],
  },
  dog: {
    name: '狗守護靈',
    category: '高齡長照與失智照護',
    tone: 'forest',
    stages: [],
  },
  rabbit: {
    name: '兔子守護靈',
    category: '疾病醫療、心理與善終',
    tone: 'forest',
    stages: [],
  },
  dolphin: {
    name: '海豚守護靈',
    category: '人權、法治、性別與社區',
    tone: 'sky',
    stages: [],
  },
  bird: {
    name: '彩羽鳥靈',
    category: '教育翻轉、人文與藝術',
    artwork: '/illustrations/guardians/bird',
    tone: 'sky',
    stages: ['初生', '萌芽', '探索', '展翼', '綻放'],
  },
  deer: {
    name: '森林鹿靈',
    category: '生態環境與動物福利',
    artwork: '/illustrations/guardians/deer',
    tone: 'forest',
    stages: ['初生', '萌芽', '探索', '茁壯', '綻放'],
  },
}
export function spiritImage(species: SpiritSpecies, level: number) {
  const root = spiritCatalog[species].artwork
  return root
    ? `${root}/lv${Math.max(1, Math.min(5, Math.trunc(level)))}.png`
    : undefined
}
