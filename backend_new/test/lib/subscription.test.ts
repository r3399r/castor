import { describe, expect, it } from 'vitest';
import { nextChargeAt } from 'src/lib/subscription';
import {
  RENEWAL_GRACE_MS,
  findRecurringPlan,
  nominalPeriodEnd,
} from 'src/lib/subscriptionPlan';

/**
 * The one date a screen may print as "next charge".
 *
 * `current_period_end` is not that date: the renewal grace is baked
 * into it, so a UI reading it as a billing date is three days late
 * every time. On a monthly period "下一次扣款日約為" hid that for
 * weeks -- three days inside a month passes for rounding. It took a
 * one-day test period, where the same three days read as a charge four
 * days out, for anyone to notice.
 */
describe('nextChargeAt', () => {
  const storedEnd = new Date('2026-12-02T00:00:00.000Z');

  it('takes the renewal grace back off a recurring period', () => {
    expect(nextChargeAt('monthly', storedEnd)?.toISOString()).toBe('2026-11-29T00:00:00.000Z');
  });

  /**
   * Exact, not approximate: this is renewSubscriptionPeriod's own
   * arithmetic run backwards, so it lands on the period the plan sold
   * to the millisecond -- which is the whole claim, since a date on a
   * screen is read as a promise.
   */
  it('recovers the period the plan actually sold', () => {
    const start = new Date('2026-11-28T00:00:00.000Z');
    const plan = findRecurringPlan('monthly');
    expect(plan).toBeDefined();
    if (plan === undefined) return;

    const nominal = nominalPeriodEnd(plan, start);
    const stored = new Date(nominal.getTime() + RENEWAL_GRACE_MS);

    // What the database holds, and what the UI used to print.
    expect(stored.toISOString()).toBe('2026-12-31T00:00:00.000Z');
    // What ECPay's scheduler will actually do.
    expect(nextChargeAt(plan.code, stored)?.toISOString()).toBe(nominal.toISOString());
    expect(nominal.toISOString()).toBe('2026-12-28T00:00:00.000Z');
  });

  it('is null for a day pass, which has no grace in it and nothing to renew', () => {
    // Subtracting here would name a date three days inside days the
    // user paid for, and call it a charge.
    expect(nextChargeAt('days30', storedEnd)).toBeNull();
    expect(nextChargeAt('days365', storedEnd)).toBeNull();
  });

  it('is null for a plan code the catalog no longer has', () => {
    // `annual`, retired 2026-11-10. Its stored end does have grace in
    // it, but a date is read as a promise and guessing at one for a
    // plan we no longer define is worse than saying nothing.
    expect(nextChargeAt('annual', storedEnd)).toBeNull();
  });
});
