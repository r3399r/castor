/**
 * The plan catalog, and the only place a price is stated.
 *
 * The webapp has its own copy of the plan *names* and marketing copy,
 * but not of the amounts: a price shown in one place and signed in
 * another is a bug that charges a real card the wrong number, so the
 * client reads the amount from GET /api/info/plans and never from a
 * constant of its own.
 *
 * Two kinds of plan live here, and the difference is not a detail:
 *
 *   recurring -- ECPay's 信用卡定期定額. The cardholder authorises once
 *     and ECPay charges on its own schedule until it stops. Access is
 *     extended by a notification we receive, forever, without the user
 *     doing anything.
 *   dayPass   -- a single AIO payment that buys a fixed number of days.
 *     Nothing recurs, so nothing has to be cancelled, and the payment
 *     may be made by ATM or at a convenience store -- which is why it
 *     exists: a student without a credit card cannot buy the recurring
 *     plan at all.
 *
 * A day pass completing therefore has to stop any live recurring
 * agreement, or the user pays twice for overlapping access and only
 * notices on their card statement. ECPay's schedule is entirely theirs:
 * our `current_period_end` does not influence when they charge.
 */

export type RecurringPlanCode = 'monthly';
export type DayPassPlanCode = 'days30' | 'days90' | 'days365';
export type PlanCode = RecurringPlanCode | DayPassPlanCode;

type PlanCommon = {
  /** NTD. ECPay takes integers only -- no decimals exist here. */
  amount: number;
  /** Shown on ECPay's payment page and the cardholder's statement. */
  itemName: string;
  tradeDesc: string;
};

export type RecurringPlan = PlanCommon & {
  kind: 'recurring';
  code: RecurringPlanCode;
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
};

export type DayPassPlan = PlanCommon & {
  kind: 'dayPass';
  code: DayPassPlanCode;
  /**
   * Days of access this buys. Added to whichever is later, now or the
   * current period end, so buying while still subscribed stacks rather
   * than discarding time already paid for.
   */
  days: number;
};

export type Plan = RecurringPlan | DayPassPlan;

export const PLANS: readonly Plan[] = [
  {
    kind: 'recurring',
    code: 'monthly',
    amount: 179,
    periodType: 'M',
    frequency: 1,
    execTimes: 99,
    itemName: '學益訂閱 月繳方案',
    tradeDesc: '學益 Learn for Good 訂閱',
  },
  // Priced per day at roughly 6.6 / 6.1 / 5.5 NTD, so a longer pass is
  // cheaper per day and the monthly recurring plan (179 ≈ 5.9/day) sits
  // between the 30- and 90-day passes. The recurring plan is meant to be
  // better value than the shortest pass without undercutting the longest.
  {
    kind: 'dayPass',
    code: 'days30',
    amount: 199,
    days: 30,
    itemName: '學益 30 天方案',
    tradeDesc: '學益 Learn for Good 30 天',
  },
  {
    kind: 'dayPass',
    code: 'days90',
    amount: 549,
    days: 90,
    itemName: '學益 90 天方案',
    tradeDesc: '學益 Learn for Good 90 天',
  },
  {
    kind: 'dayPass',
    code: 'days365',
    amount: 1999,
    days: 365,
    itemName: '學益 365 天方案',
    tradeDesc: '學益 Learn for Good 365 天',
  },
] as const;

export const findPlan = (code: string): Plan | undefined =>
  PLANS.find((plan) => plan.code === code);

export const isRecurringPlan = (plan: Plan): plan is RecurringPlan =>
  plan.kind === 'recurring';

export const isDayPassPlan = (plan: Plan): plan is DayPassPlan => plan.kind === 'dayPass';

/** The recurring plan for a code, or undefined if the code is a day pass. */
export const findRecurringPlan = (code: string): RecurringPlan | undefined => {
  const plan = findPlan(code);
  return plan !== undefined && isRecurringPlan(plan) ? plan : undefined;
};

/** The day pass for a code, or undefined if the code is the recurring plan. */
export const findDayPassPlan = (code: string): DayPassPlan | undefined => {
  const plan = findPlan(code);
  return plan !== undefined && isDayPassPlan(plan) ? plan : undefined;
};

/**
 * Slack between the end of a paid period and the next charge.
 *
 * ECPay decides when it authorises, and that moment will not line up to
 * the second with a period end we computed ourselves. Without a buffer
 * the gap shows up as a paying subscriber being refused for a few hours
 * -- which they report as the feature being broken. Three days is
 * cheap; the cost of being wrong the other way is a support ticket.
 *
 * Only recurring periods get it. A day pass is paid up front for an
 * exact number of days and nothing is scheduled to follow it, so there
 * is no provider clock to be out of step with -- adding grace there
 * would just be three free days per purchase.
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
 *
 * Recurring plans only -- a day pass has no next charge to track. Its
 * end is `dayPassEnd`, which is plain day arithmetic.
 */
export const nominalPeriodEnd = (plan: RecurringPlan, start: Date): Date => {
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

/**
 * Where a day pass bought at `from` ends: exactly `days` later.
 *
 * Plain days rather than calendar months, because that is what was sold
 * -- "90 天" has to be 90 days whichever months it spans, and a user who
 * buys in February must not get a shorter pass than one who buys in
 * March.
 */
export const dayPassEnd = (plan: DayPassPlan, from: Date): Date =>
  new Date(from.getTime() + plan.days * DAY_MS);
