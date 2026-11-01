import { spiritCatalog, type SpiritSpecies } from '@/lib/guardianArtwork'

export const DONATION_DEMO_STORAGE_KEY = 'castor:donation-demo:v2'
export const DEMO_DONATION_AMOUNT = 100

export type DonationDemoStage =
  | 'not-maxed'
  | 'eligible'
  | 'pending'
  | 'disbursed'

export type DonationDemoState = {
  version: 2
  stage: DonationDemoStage
  spirit: SpiritSpecies
  vip: boolean
  celebrationSeen: boolean
  draftCategory: string | null
  draftOrganizationId: string | null
  organizationId: string | null
  selectedAt: string | null
  disbursedAt: string | null
}

export type DemoOrganization = {
  id: string
  name: string
  category: string
  focus: string
  description: string
  website: string
}

export const defaultDonationDemoState: DonationDemoState = {
  version: 2,
  stage: 'not-maxed',
  spirit: 'deer',
  vip: false,
  celebrationSeen: false,
  draftCategory: null,
  draftOrganizationId: null,
  organizationId: null,
  selectedAt: null,
  disbursedAt: null,
}

const categoryNames = Object.values(spiritCatalog).map((item) => item.category)

export const demoOrganizations: DemoOrganization[] = categoryNames.flatMap(
  (category, categoryIndex) =>
    ['同行站', '共好所', '微光行動'].map((suffix, index) => ({
      id: `demo-${categoryIndex + 1}-${index + 1}`,
      name: `${['晨露', '青芽', '暖光'][index]}${suffix}（示範公益組織）`,
      category,
      focus: [
        '提供在地陪伴、資源轉介與生活支持',
        '推動教育倡議、社群培力與友善服務',
        '串連志工與專業資源，回應長期需求',
      ][index],
      description: `此為「${category}」分類的虛構示範組織，用於展示服務說明與支持選擇流程，不代表任何真實合作關係。`,
      website: 'https://example.org/',
    })),
)

export function organizationsFor(state: DonationDemoState) {
  const category = state.vip
    ? (state.draftCategory ?? categoryNames[0])
    : spiritCatalog[state.spirit].category
  return demoOrganizations.filter((item) => item.category === category)
}

export const demoOrganizationCategories = categoryNames

export function readDonationDemoState(): DonationDemoState {
  if (typeof window === 'undefined') return defaultDonationDemoState
  try {
    const raw = window.localStorage.getItem(DONATION_DEMO_STORAGE_KEY)
    if (!raw) return defaultDonationDemoState
    const value = JSON.parse(raw) as Partial<DonationDemoState>
    if (value.version !== 2) return defaultDonationDemoState
    const validStages: DonationDemoStage[] = ['not-maxed', 'eligible', 'pending', 'disbursed']
    if (!validStages.includes(value.stage as DonationDemoStage)) return defaultDonationDemoState
    if (!(value.spirit && value.spirit in spiritCatalog)) return defaultDonationDemoState
    return { ...defaultDonationDemoState, ...value } as DonationDemoState
  } catch {
    return defaultDonationDemoState
  }
}

export function writeDonationDemoState(state: DonationDemoState) {
  try {
    window.localStorage.setItem(DONATION_DEMO_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // The demo remains usable for this tab when storage is blocked or full.
  }
}

export function findDemoOrganization(id: string | null) {
  return demoOrganizations.find((item) => item.id === id)
}
