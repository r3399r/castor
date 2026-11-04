import type {
  GetSubscriptionHistoryResponse,
  SubscriptionStatus,
} from '@/types/api'
import { formatNumber } from '@/lib/number'

export type SubscriptionPlanCode = 'monthly' | 'annual'

/**
 * How a plan is presented. Deliberately holds no price.
 *
 * The amount is signed into the payment order server-side, so a constant
 * here could show one number and charge another. Prices come from
 * GET /api/info/plans via usePlanAmounts, and a plan whose amount has
 * not loaded is shown without one rather than with a guess.
 */
export type SubscriptionPlan = {
  code: SubscriptionPlanCode
  name: string
  periodLabel: '月' | '年'
  /** How the renewal reads in a sentence: "將每月自動續訂". */
  renewalLabel: '每月' | '每年'
  note: string
  recommended?: boolean
}

export const subscriptionPlans: readonly SubscriptionPlan[] = [
  {
    code: 'monthly',
    name: '月繳方案',
    periodLabel: '月',
    renewalLabel: '每月',
    note: '按月計費，可隨時取消',
  },
  {
    code: 'annual',
    name: '年繳方案',
    periodLabel: '年',
    renewalLabel: '每年',
    note: '一次付清一年',
    recommended: true,
  },
] as const

export function getSubscriptionPlan(code: string | null | undefined) {
  return subscriptionPlans.find((plan) => plan.code === code)
}

/** `NT$199／月`, or just the period when the price is not known yet. */
export function formatPlanPrice(plan: SubscriptionPlan, amount: number | null | undefined) {
  if (typeof amount !== 'number') return `／${plan.periodLabel}`
  return `NT$${formatNumber(amount)}／${plan.periodLabel}`
}

export function formatTaiwanDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '日期待確認'
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * There is no `scheduled_change`.
 *
 * ECPay cannot amend a recurring agreement, and cancelling one is
 * irreversible, so "change plan at the end of the period" is not a state
 * the payment provider can be in. Changing plan opens a new agreement
 * that charges immediately, and the days already paid for are credited
 * by starting the new period where the old one ended -- which shows up
 * here as a plain `active` period with a later start date, not as a
 * pending change.
 */
export type SubscriptionView =
  | { kind: 'free'; previousExpired: boolean }
  | {
      kind: 'active'
      planCode: string
      entitlementEndsAt: string
    }
  | {
      kind: 'cancelled'
      planCode: string
      entitlementEndsAt: string
      entitlementActive: true
    }
  | {
      kind: 'expired'
      planCode: string
    }
  | {
      kind: 'payment_failed'
      planCode: string
      entitlementActive: false
    }

/**
 * Keeps entitlement and billing state separate. A cancelled period retains
 * access until its current period ends even though auto-renew is no longer on.
 */
export function deriveSubscriptionView(
  current: SubscriptionStatus,
  history: GetSubscriptionHistoryResponse,
): SubscriptionView {
  if (current.active && current.plan && current.expiresAt) {
    return {
      kind: 'active',
      planCode: current.plan,
      entitlementEndsAt: current.expiresAt,
    }
  }

  const latest = history[0]
  if (!latest) return { kind: 'free', previousExpired: false }

  // Nothing writes 'past_due' yet: a declined renewal leaves the period
  // alone and lets it lapse, because the user has paid for the days they
  // are in and ECPay retries before giving up. The branch stays because
  // the column documents the status, and dunning is a product decision
  // rather than a missing line of code.
  if (latest.status === 'past_due') {
    return {
      kind: 'payment_failed',
      planCode: latest.plan,
      entitlementActive: false,
    }
  }

  if (
    latest.status === 'cancelled' &&
    new Date(latest.currentPeriodEnd).getTime() > Date.now()
  ) {
    return {
      kind: 'cancelled',
      planCode: latest.plan,
      entitlementEndsAt: latest.currentPeriodEnd,
      entitlementActive: true,
    }
  }

  return { kind: 'expired', planCode: latest.plan }
}
