import { describe, expect, it } from 'vitest'
import type { GetSubscriptionHistoryResponse, SubscriptionStatus } from '@/types/api'
import {
  deriveSubscriptionView,
  formatPlanPrice,
  formatTaiwanDate,
  getSubscriptionPlan,
  isDayPassPlanCode,
  subscriptionPlans,
} from './subscription'

const status = (over: Partial<SubscriptionStatus> = {}): SubscriptionStatus => ({
  active: false,
  plan: null,
  expiresAt: null,
  entitled: false,
  autoRenew: false,
  ...over,
})

type HistoryItem = GetSubscriptionHistoryResponse[number]

const period = (over: Partial<HistoryItem> = {}): HistoryItem => ({
  id: 1,
  plan: 'monthly',
  status: 'active',
  currentPeriodStart: '2026-10-01T00:00:00.000Z',
  currentPeriodEnd: '2026-11-01T00:00:00.000Z',
  ...over,
})

const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

describe('getSubscriptionPlan', () => {
  it('finds a plan by its stored code', () => {
    expect(getSubscriptionPlan('monthly')?.kind).toBe('recurring')
    expect(getSubscriptionPlan('days90')?.kind).toBe('dayPass')
  })

  it('returns undefined for a retired or unknown code', () => {
    // `annual` was retired on 2026-11-10 and still appears in stored
    // periods, so every caller has to tolerate this.
    expect(getSubscriptionPlan('annual')).toBeUndefined()
    expect(getSubscriptionPlan('whatever-ships-next')).toBeUndefined()
    expect(getSubscriptionPlan(null)).toBeUndefined()
    expect(getSubscriptionPlan(undefined)).toBeUndefined()
  })
})

describe('isDayPassPlanCode', () => {
  it('is true only for the passes', () => {
    expect(isDayPassPlanCode('days30')).toBe(true)
    expect(isDayPassPlanCode('days365')).toBe(true)
    expect(isDayPassPlanCode('monthly')).toBe(false)
  })

  it('treats an unknown code as not a pass', () => {
    // Saying 不會自動續訂 about an agreement we cannot see would be a
    // promise with no basis.
    expect(isDayPassPlanCode('annual')).toBe(false)
    expect(isDayPassPlanCode(null)).toBe(false)
  })
})

describe('formatPlanPrice', () => {
  const monthly = subscriptionPlans[0]
  const days365 = subscriptionPlans[3]

  it('quotes the price in the plan period', () => {
    expect(formatPlanPrice(monthly, 179)).toBe('NT$179／月')
    expect(formatPlanPrice(days365, 1_999)).toBe('NT$1,999／365 天')
  })

  it('shows the period alone until the price has loaded', () => {
    // Never a guessed number: the amount is signed into the order
    // server-side, so a placeholder here could contradict the charge.
    expect(formatPlanPrice(monthly, null)).toBe('／月')
    expect(formatPlanPrice(monthly, undefined)).toBe('／月')
  })

  it('shows a free period as NT$0 rather than as unknown', () => {
    expect(formatPlanPrice(monthly, 0)).toBe('NT$0／月')
  })
})

describe('the plan catalog', () => {
  it('has unique codes', () => {
    const codes = subscriptionPlans.map((plan) => plan.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('recommends exactly one plan', () => {
    expect(subscriptionPlans.filter((plan) => plan.recommended)).toHaveLength(1)
  })

  it('gives a renewal label only to what actually renews', () => {
    for (const plan of subscriptionPlans) {
      if (plan.kind === 'dayPass') expect(plan.renewalLabel, plan.code).toBeUndefined()
      else expect(plan.renewalLabel, plan.code).toBeDefined()
    }
  })
})

describe('formatTaiwanDate', () => {
  it('reads an ISO timestamp in Taipei time', () => {
    // 16:30Z is already the next day in Taipei (+08:00); a browser in
    // another zone must not render the day before.
    expect(formatTaiwanDate('2026-11-13T16:30:00.000Z')).toBe('2026/11/14')
    expect(formatTaiwanDate('2026-11-13T15:59:00.000Z')).toBe('2026/11/13')
  })

  it('accepts a Date as well as a string', () => {
    expect(formatTaiwanDate(new Date('2026-01-05T04:00:00.000Z'))).toBe('2026/01/05')
  })

  it('says 日期待確認 rather than Invalid Date', () => {
    expect(formatTaiwanDate('not a date')).toBe('日期待確認')
    expect(formatTaiwanDate('')).toBe('日期待確認')
    expect(formatTaiwanDate(new Date(Number.NaN))).toBe('日期待確認')
  })
})

/**
 * The split this function exists for: having access and being charged
 * again are different facts. Reading `active` as both told day-pass
 * buyers their one-off purchase renewed every month, and offered them a
 * cancel button that reported success while stopping nothing.
 */
describe('deriveSubscriptionView', () => {
  it('is active when a live agreement will charge again', () => {
    const view = deriveSubscriptionView(
      status({ active: true, plan: 'monthly', expiresAt: future, autoRenew: true }),
      []
    )
    expect(view).toEqual({
      kind: 'active',
      planCode: 'monthly',
      entitlementEndsAt: future,
    })
  })

  it('is unmanaged when access is paid for but nothing renews', () => {
    const view = deriveSubscriptionView(
      status({ active: true, plan: 'days30', expiresAt: future, autoRenew: false }),
      []
    )
    expect(view.kind).toBe('unmanaged')
  })

  it('reads autoRenew, not the plan code, for that fork', () => {
    // For the hours between buying a pass as a subscriber and housekeep
    // cancelling the superseded agreement, the current plan is a pass
    // while the card is still going to be charged.
    const view = deriveSubscriptionView(
      status({ active: true, plan: 'days30', expiresAt: future, autoRenew: true }),
      []
    )
    expect(view.kind).toBe('active')
  })

  it('is free when there is no current period and no history', () => {
    expect(deriveSubscriptionView(status(), [])).toEqual({
      kind: 'free',
      previousExpired: false,
    })
  })

  it('falls through to history when active arrives without a plan or an end', () => {
    // Both fields are nullable in the response, and a half-populated
    // status must not become an `active` view with planCode null.
    expect(deriveSubscriptionView(status({ active: true }), []).kind).toBe('free')
    expect(
      deriveSubscriptionView(status({ active: true, plan: 'monthly' }), []).kind
    ).toBe('free')
  })

  it('reports a declined renewal as payment_failed', () => {
    const view = deriveSubscriptionView(status(), [
      period({ plan: 'monthly', status: 'past_due' }),
    ])
    expect(view).toEqual({
      kind: 'payment_failed',
      planCode: 'monthly',
      entitlementActive: false,
    })
  })

  it('keeps access for a cancelled agreement until its period ends', () => {
    const view = deriveSubscriptionView(status(), [
      period({ plan: 'monthly', status: 'cancelled', currentPeriodEnd: future }),
    ])
    expect(view).toEqual({
      kind: 'cancelled',
      planCode: 'monthly',
      entitlementEndsAt: future,
      entitlementActive: true,
    })
  })

  it('calls a cancelled pass unmanaged, because it had no renewal to cancel', () => {
    const view = deriveSubscriptionView(status(), [
      period({ plan: 'days90', status: 'cancelled', currentPeriodEnd: future }),
    ])
    expect(view.kind).toBe('unmanaged')
  })

  it('is expired once a cancelled period has run out', () => {
    const view = deriveSubscriptionView(status(), [
      period({ plan: 'monthly', status: 'cancelled', currentPeriodEnd: past }),
    ])
    expect(view).toEqual({ kind: 'expired', planCode: 'monthly' })
  })

  it('is expired for a lapsed period', () => {
    const view = deriveSubscriptionView(status(), [
      period({ plan: 'days30', status: 'expired', currentPeriodEnd: past }),
    ])
    expect(view).toEqual({ kind: 'expired', planCode: 'days30' })
  })

  it('reads only the newest period', () => {
    // The response is newest-first; an older row must not override it.
    const view = deriveSubscriptionView(status(), [
      period({ id: 2, plan: 'days30', status: 'expired', currentPeriodEnd: past }),
      period({ id: 1, plan: 'monthly', status: 'cancelled', currentPeriodEnd: future }),
    ])
    expect(view).toEqual({ kind: 'expired', planCode: 'days30' })
  })
})
