import type {
  GetSubscriptionHistoryResponse,
  SubscriptionStatus,
} from '@/types/api'
import { formatNumber } from '@/lib/number'

export type SubscriptionPlanCode = 'monthly' | 'days30' | 'days90' | 'days365'

/**
 * How a plan is presented. Deliberately holds no price.
 *
 * The amount is signed into the payment order server-side, so a constant
 * here could show one number and charge another. Prices come from
 * GET /api/info/plans via usePlanAmounts, and a plan whose amount has
 * not loaded is shown without one rather than with a guess.
 *
 * `kind` is the fork that matters, and not only cosmetically:
 *
 *   recurring -- ECPay's 信用卡定期定額. Credit card only, by their
 *     product, and it keeps charging until cancelled.
 *   dayPass   -- one payment for a fixed number of days. Payable by ATM
 *     or at a convenience store, which is the whole point: a student
 *     without a credit card cannot buy the recurring plan at all.
 *
 * `annual` was retired on 2026-11-10 and replaced by the 365-day pass.
 * The code may still appear in a stored period, so anything rendering a
 * historical plan has to tolerate an unknown code -- see
 * getSubscriptionPlan returning undefined.
 */
export type SubscriptionPlan = {
  code: SubscriptionPlanCode
  kind: 'recurring' | 'dayPass'
  name: string
  /** The unit a price is quoted in: `NT$179／月`, `NT$549／90 天`. */
  periodLabel: string
  /** How the renewal reads in a sentence: "將每月自動續訂". */
  renewalLabel?: '每月' | '每年'
  note: string
  recommended?: boolean
}

export const subscriptionPlans: readonly SubscriptionPlan[] = [
  {
    code: 'monthly',
    kind: 'recurring',
    name: '月繳訂閱',
    periodLabel: '月',
    renewalLabel: '每月',
    note: '自動續訂，可隨時取消',
  },
  {
    code: 'days30',
    kind: 'dayPass',
    name: '30 天',
    periodLabel: '30 天',
    note: '不自動續訂，可用超商或 ATM 付款',
  },
  {
    code: 'days90',
    kind: 'dayPass',
    name: '90 天',
    periodLabel: '90 天',
    note: '不自動續訂，可用超商或 ATM 付款',
    recommended: true,
  },
  {
    code: 'days365',
    kind: 'dayPass',
    name: '365 天',
    periodLabel: '365 天',
    note: '不自動續訂，每天最便宜',
  },
] as const

export function getSubscriptionPlan(code: string | null | undefined) {
  return subscriptionPlans.find((plan) => plan.code === code)
}

/** `NT$179／月`, or just the period when the price is not known yet. */
export function formatPlanPrice(plan: SubscriptionPlan, amount: number | null | undefined) {
  if (typeof amount !== 'number') return `／${plan.periodLabel}`
  return `NT$${formatNumber(amount)}／${plan.periodLabel}`
}

/**
 * The payment methods a day pass accepts, as the picker shows them.
 *
 * Sent to the backend as a fixed ChoosePayment rather than letting ECPay
 * offer everything: the expiry parameter differs per method, and
 * StoreExpireDate means minutes for a store code but days for a barcode,
 * so the order cannot be built correctly until the method is known.
 */
export const dayPassPaymentMethods = [
  { value: 'Credit', label: '信用卡', note: '立即開通' },
  { value: 'ATM', label: 'ATM 轉帳', note: '取得虛擬帳號，7 天內轉帳' },
  { value: 'CVS', label: '超商代碼', note: '取得代碼，到超商櫃台繳費' },
  { value: 'BARCODE', label: '超商條碼', note: '取得條碼，到超商櫃台繳費' },
] as const

export type DayPassPaymentMethod = (typeof dayPassPaymentMethods)[number]['value']

/**
 * Whether a stored plan code is a day pass.
 *
 * One definition, because two screens branch on it and they must not
 * disagree. An unknown code -- `annual`, retired on 2026-11-10, or
 * anything a future release adds -- is not a pass: treating it as one
 * would promise "不會自動續訂" about an agreement we cannot see.
 */
export function isDayPassPlanCode(code: string | null | undefined) {
  return getSubscriptionPlan(code)?.kind === 'dayPass'
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
  /**
   * Paid access *and* a live agreement: something will charge again
   * unless it is cancelled. The only state where a cancel button has
   * anything to cancel.
   */
  | {
      kind: 'active'
      planCode: string
      entitlementEndsAt: string
    }
  /**
   * Paid access with nothing behind it to renew -- a day pass, or a
   * period granted by hand. Distinguished from `active` by autoRenew
   * and not by the plan code, because the two can disagree: for the
   * hours between buying a pass as a subscriber and housekeep
   * cancelling the superseded agreement, the current plan is a pass
   * while the card is still going to be charged.
   */
  | {
      kind: 'unmanaged'
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
    // The split that this whole type exists for: having access and
    // being charged again are different facts, and only the server
    // knows the second one. Reading `active` as both told day-pass
    // buyers their one-off purchase renewed every month, and offered
    // them a cancel button that reported success while stopping
    // nothing.
    return {
      kind: current.autoRenew ? 'active' : 'unmanaged',
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
    // A pass has no renewal to have cancelled, so "已取消續訂" would be
    // nonsense even though the row genuinely says cancelled: that is
    // what pressing the old cancel button did to a day pass, and it is
    // also what buying one as a subscriber leaves behind. Either way the
    // honest reading is "paid days, nothing renewing".
    return isDayPassPlanCode(latest.plan)
      ? {
          kind: 'unmanaged',
          planCode: latest.plan,
          entitlementEndsAt: latest.currentPeriodEnd,
        }
      : {
          kind: 'cancelled',
          planCode: latest.plan,
          entitlementEndsAt: latest.currentPeriodEnd,
          entitlementActive: true,
        }
  }

  return { kind: 'expired', planCode: latest.plan }
}
