import type {
  GetSubscriptionHistoryResponse,
  SubscriptionStatus,
} from '@/types/api'
import { formatNumber } from '@/lib/number'

export type SubscriptionPlanCode = 'monthly' | 'annual'

export type SubscriptionPlan = {
  code: SubscriptionPlanCode
  name: string
  price: number
  periodLabel: '月' | '年'
  note: string
  recommended?: boolean
}

export const subscriptionPlans: readonly SubscriptionPlan[] = [
  {
    code: 'monthly',
    name: '月繳方案',
    price: 199,
    periodLabel: '月',
    note: '按月計費，可隨時取消',
  },
  {
    code: 'annual',
    name: '年繳方案',
    price: 1990,
    periodLabel: '年',
    note: '平均每月約 NT$166（暫定）',
    recommended: true,
  },
] as const

export function getSubscriptionPlan(code: string | null | undefined) {
  return subscriptionPlans.find((plan) => plan.code === code)
}

export function formatPlanPrice(plan: SubscriptionPlan) {
  return `NT$${formatNumber(plan.price)}／${plan.periodLabel}`
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

export type SubscriptionView =
  | { kind: 'free'; previousExpired: boolean }
  | {
      kind: 'active'
      planCode: string
      entitlementEndsAt: string
    }
  | {
      kind: 'scheduled_change'
      planCode: string
      entitlementEndsAt: string
      pendingPlanCode: string
      pendingPlanEffectiveAt: string
      pendingPlanAmount: number
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
  if (
    current.active &&
    current.plan &&
    current.expiresAt &&
    current.pendingPlan &&
    current.pendingPlanEffectiveAt &&
    typeof current.pendingPlanAmount === 'number'
  ) {
    return {
      kind: 'scheduled_change',
      planCode: current.plan,
      entitlementEndsAt: current.expiresAt,
      pendingPlanCode: current.pendingPlan,
      pendingPlanEffectiveAt: current.pendingPlanEffectiveAt,
      pendingPlanAmount: current.pendingPlanAmount,
    }
  }

  if (current.active && current.plan && current.expiresAt) {
    return {
      kind: 'active',
      planCode: current.plan,
      entitlementEndsAt: current.expiresAt,
    }
  }

  const latest = history[0]
  if (!latest) return { kind: 'free', previousExpired: false }

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
