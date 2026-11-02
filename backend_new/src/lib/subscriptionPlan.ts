/**
 * The plan catalog, and the only place a price is stated.
 *
 * The webapp has its own copy of the plan *names* and marketing copy,
 * but not of the amounts: a price shown in one place and signed in
 * another is a bug that charges a real card the wrong number, so the
 * client reads the amount from GET /api/info/plans and never from a
 * constant of its own.
 */

export type PlanCode = 'monthly' | 'annual';

export type SubscriptionPlan = {
  code: PlanCode;
  /** NTD per charge. ECPay takes integers only -- no decimals exist here. */
  amount: number;
  periodType: 'D' | 'M' | 'Y';
  frequency: number;
  /**
   * How many charges ECPay will attempt before ending the agreement by
   * itself. It must be at least 2, and ECPay caps it (999 for D and M,
   * 99 for Y); these sit well under the cap because a merchant account
   * may need approval for longer runs. When it does run out the
   * subscription simply lapses, which the access check already handles
   * -- the user re-subscribes, and nothing has to sweep anything.
   */
  execTimes: number;
  /** Shown on ECPay's payment page and the cardholder's statement. */
  itemName: string;
  tradeDesc: string;
};

export const SUBSCRIPTION_PLANS: readonly SubscriptionPlan[] = [
  {
    code: 'monthly',
    amount: 199,
    periodType: 'M',
    frequency: 1,
    execTimes: 99,
    itemName: '學益訂閱 月繳方案',
    tradeDesc: '學益 Learn for Good 訂閱',
  },
  {
    code: 'annual',
    amount: 1990,
    periodType: 'Y',
    frequency: 1,
    execTimes: 20,
    itemName: '學益訂閱 年繳方案',
    tradeDesc: '學益 Learn for Good 訂閱',
  },
] as const;

export const findPlan = (code: string): SubscriptionPlan | undefined =>
  SUBSCRIPTION_PLANS.find((plan) => plan.code === code);

/**
 * Slack between the end of a paid period and the next charge.
 *
 * ECPay decides when it authorises, and that moment will not line up to
 * the second with a period end we computed ourselves. Without a buffer
 * the gap shows up as a paying subscriber being refused for a few hours
 * -- which they report as the feature being broken. Three days is
 * cheap; the cost of being wrong the other way is a support ticket.
 */
export const RENEWAL_GRACE_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
export const RENEWAL_GRACE_MS = RENEWAL_GRACE_DAYS * DAY_MS;

/**
 * Where a period starting at `start` nominally ends -- the moment ECPay
 * is expected to charge again, with no grace added.
 *
 * The grace belongs to the stored `current_period_end` and not here, so
 * that chaining one period onto the next can subtract it back off. If
 * each period started where the previous one's *graced* end fell, the
 * three days would compound into more than a month of free access a
 * year.
 *
 * Calendar arithmetic, not a fixed number of days, so our period end
 * tracks ECPay's monthly/yearly schedule instead of drifting a day or
 * two further from it every cycle. The day-of-month is clamped rather
 * than allowed to roll over, so 1/31 plus one month is the end of
 * February and not the 2nd or 3rd of March.
 */
export const nominalPeriodEnd = (plan: SubscriptionPlan, start: Date): Date => {
  const end = new Date(start.getTime());

  if (plan.periodType === 'D') {
    end.setUTCDate(end.getUTCDate() + plan.frequency);
  } else {
    const months = plan.periodType === 'Y' ? plan.frequency * 12 : plan.frequency;
    const day = end.getUTCDate();
    end.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + months);
    const lastDayOfMonth = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)
    ).getUTCDate();
    end.setUTCDate(Math.min(day, lastDayOfMonth));
  }

  return end;
};
