import { afterEach, describe, expect, it } from 'vitest'
import {
  DEMO_DONATION_AMOUNT,
  DONATION_DEMO_STORAGE_KEY,
  defaultDonationDemoState,
  demoOrganizationCategories,
  demoOrganizations,
  eligibleDonationState,
  findDemoOrganization,
  formalDonationStorageKey,
  organizationsFor,
  readDonationState,
  writeDonationState,
  type DonationDemoState,
} from './donationDemo'
import { spiritCatalog } from './guardianArtwork'

/**
 * The demo keeps its whole state in one localStorage value, so the part
 * worth testing is what happens to a value written by an older release or
 * by hand: `readDonationState` has to reject it and fall back rather than
 * hand a half-shaped object to the screens. A plain object stands in for
 * `window` -- the module only ever reaches for `window.localStorage`.
 */
const stubWindow = (throwOnSet = false) => {
  const map = new Map<string, string>()
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: {
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => {
          if (throwOnSet) throw new Error('quota')
          map.set(key, value)
        },
        removeItem: (key: string) => void map.delete(key),
      },
    },
    configurable: true,
    writable: true,
  })
  return map
}

afterEach(() => {
  Reflect.deleteProperty(globalThis as object, 'window')
})

describe('readDonationState', () => {
  it('returns the fallback when nothing is stored', () => {
    stubWindow()
    expect(readDonationState(DONATION_DEMO_STORAGE_KEY)).toEqual(
      defaultDonationDemoState
    )
  })

  it('reads back what was written', () => {
    stubWindow()
    const state: DonationDemoState = {
      ...defaultDonationDemoState,
      stage: 'pending',
      spirit: 'cat',
      organizationId: demoOrganizations[0].id,
    }
    writeDonationState(DONATION_DEMO_STORAGE_KEY, state)
    expect(readDonationState(DONATION_DEMO_STORAGE_KEY)).toEqual(state)
  })

  it('fills in the keys a stored state is missing', () => {
    // A value written before a field was added is still usable; what it
    // must not do is produce an object with that field undefined.
    const stored = stubWindow()
    stored.set(
      DONATION_DEMO_STORAGE_KEY,
      JSON.stringify({ version: 2, stage: 'eligible', spirit: 'deer' })
    )
    expect(readDonationState(DONATION_DEMO_STORAGE_KEY)).toEqual({
      ...defaultDonationDemoState,
      stage: 'eligible',
    })
  })

  it('rejects a state from an older version of the shape', () => {
    const stored = stubWindow()
    stored.set(
      DONATION_DEMO_STORAGE_KEY,
      JSON.stringify({ version: 1, stage: 'eligible', spirit: 'deer' })
    )
    expect(readDonationState(DONATION_DEMO_STORAGE_KEY)).toEqual(
      defaultDonationDemoState
    )
  })

  it('rejects a stage or a spirit it does not know', () => {
    const stored = stubWindow()
    stored.set(
      DONATION_DEMO_STORAGE_KEY,
      JSON.stringify({ version: 2, stage: 'disbursing', spirit: 'deer' })
    )
    expect(readDonationState(DONATION_DEMO_STORAGE_KEY).stage).toBe('not-maxed')

    stored.set(
      DONATION_DEMO_STORAGE_KEY,
      JSON.stringify({ version: 2, stage: 'eligible', spirit: 'phoenix' })
    )
    expect(readDonationState(DONATION_DEMO_STORAGE_KEY).stage).toBe('not-maxed')
  })

  it('rejects a value that is not JSON at all', () => {
    const stored = stubWindow()
    stored.set(DONATION_DEMO_STORAGE_KEY, 'not json')
    expect(readDonationState(DONATION_DEMO_STORAGE_KEY)).toEqual(
      defaultDonationDemoState
    )
  })

  it('takes the fallback it is given', () => {
    const stored = stubWindow()
    stored.set(DONATION_DEMO_STORAGE_KEY, 'not json')
    const mine = eligibleDonationState('otter')
    expect(readDonationState(DONATION_DEMO_STORAGE_KEY, mine)).toEqual(mine)
  })

  it('returns the fallback during a server render, where there is no window', () => {
    // The pages are a static export, so this module is evaluated with no
    // window at build time.
    expect(readDonationState(DONATION_DEMO_STORAGE_KEY)).toEqual(
      defaultDonationDemoState
    )
  })
})

describe('writeDonationState', () => {
  it('swallows a storage failure, leaving the demo usable for this tab', () => {
    stubWindow(true)
    expect(() =>
      writeDonationState(DONATION_DEMO_STORAGE_KEY, defaultDonationDemoState)
    ).not.toThrow()
  })
})

describe('organizationsFor', () => {
  it('offers the organizations of the spirit category', () => {
    const state = eligibleDonationState('cat')
    const offered = organizationsFor(state)
    expect(offered.length).toBeGreaterThan(0)
    for (const item of offered) expect(item.category).toBe(spiritCatalog.cat.category)
  })

  it('lets a VIP pick any category', () => {
    const state: DonationDemoState = {
      ...eligibleDonationState('cat'),
      vip: true,
      draftCategory: spiritCatalog.deer.category,
    }
    for (const item of organizationsFor(state))
      expect(item.category).toBe(spiritCatalog.deer.category)
  })

  it('shows a VIP the first category until they have chosen one', () => {
    const state: DonationDemoState = { ...eligibleDonationState('cat'), vip: true }
    for (const item of organizationsFor(state))
      expect(item.category).toBe(demoOrganizationCategories[0])
  })
})

describe('the demo catalog', () => {
  it('covers every spirit category, three organizations each', () => {
    expect(demoOrganizationCategories).toHaveLength(Object.keys(spiritCatalog).length)
    expect(demoOrganizations).toHaveLength(demoOrganizationCategories.length * 3)
    for (const category of demoOrganizationCategories) {
      expect(
        demoOrganizations.filter((item) => item.category === category),
        category
      ).toHaveLength(3)
    }
  })

  it('gives every organization a unique id', () => {
    const ids = demoOrganizations.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('marks every organization as a demonstration in its name', () => {
    // Nothing here is a real charity, and the screens show these names
    // verbatim.
    for (const item of demoOrganizations) expect(item.name).toContain('示範公益組織')
  })
})

describe('findDemoOrganization', () => {
  it('finds one by id', () => {
    const first = demoOrganizations[0]
    expect(findDemoOrganization(first.id)).toEqual(first)
  })

  it('returns undefined for an id it does not hold', () => {
    expect(findDemoOrganization('demo-99-9')).toBeUndefined()
    expect(findDemoOrganization(null)).toBeUndefined()
  })
})

describe('the storage keys and the demo amount', () => {
  it('keys the formal state per guardian', () => {
    // Two spirits must not share one dismissal or one celebration flag.
    expect(formalDonationStorageKey(12)).toBe('castor:donation-ui:v1:12')
    expect(formalDonationStorageKey(12)).not.toBe(formalDonationStorageKey(13))
  })

  it('carries the demo amount in the state the demo starts from', () => {
    expect(DEMO_DONATION_AMOUNT).toBe(100)
    expect(eligibleDonationState('cat')).toEqual({
      ...defaultDonationDemoState,
      stage: 'eligible',
      spirit: 'cat',
    })
  })
})
