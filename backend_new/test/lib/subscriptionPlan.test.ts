import { describe, expect, it } from 'vitest';
import {
  RENEWAL_GRACE_MS,
  SUBSCRIPTION_PLANS,
  findPlan,
  nominalPeriodEnd,
} from 'src/lib/subscriptionPlan';

const monthly = findPlan('monthly')!;
const annual = findPlan('annual')!;

describe('the plan catalog', () => {
  it('satisfies the limits ECPay enforces on a recurring order', () => {
    for (const plan of SUBSCRIPTION_PLANS) {
      // Whole NTD only, and ExecTimes below 2 is rejected outright.
      expect(Number.isInteger(plan.amount)).toBe(true);
      expect(plan.execTimes).toBeGreaterThanOrEqual(2);
      // ECPay's caps: 365 for D, 12 for M, and Y only ever 1.
      if (plan.periodType === 'Y') expect(plan.frequency).toBe(1);
      if (plan.periodType === 'M') expect(plan.frequency).toBeLessThanOrEqual(12);
      if (plan.periodType === 'D') expect(plan.frequency).toBeLessThanOrEqual(365);
      expect(plan.execTimes).toBeLessThanOrEqual(plan.periodType === 'Y' ? 99 : 999);
    }
  });

  it('has a unique code per plan, since the code is what is stored', () => {
    const codes = SUBSCRIPTION_PLANS.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('nominalPeriodEnd', () => {
  it('advances a month by the calendar, not by 30 days', () => {
    expect(nominalPeriodEnd(monthly, new Date('2024-01-15T00:00:00Z')).toISOString()).toBe(
      '2024-02-15T00:00:00.000Z'
    );
  });

  it('clamps rather than rolling over at the end of a short month', () => {
    // The bug this prevents: setMonth on 1/31 lands in March, so a
    // subscriber silently gains two or three days every January.
    expect(nominalPeriodEnd(monthly, new Date('2024-01-31T00:00:00Z')).toISOString()).toBe(
      '2024-02-29T00:00:00.000Z'
    );
    expect(nominalPeriodEnd(monthly, new Date('2023-01-31T00:00:00Z')).toISOString()).toBe(
      '2023-02-28T00:00:00.000Z'
    );
  });

  it('advances a year by the calendar', () => {
    expect(nominalPeriodEnd(annual, new Date('2024-03-12T07:30:23Z')).toISOString()).toBe(
      '2025-03-12T07:30:23.000Z'
    );
  });

  it('keeps a leap day from drifting a year forward', () => {
    expect(nominalPeriodEnd(annual, new Date('2024-02-29T00:00:00Z')).toISOString()).toBe(
      '2025-02-28T00:00:00.000Z'
    );
  });

  it('adds no grace of its own', () => {
    // The grace belongs to the stored period end, so that chaining one
    // period onto the next can subtract it back off. If it were added
    // here, twelve monthly renewals would hand out 36 free days.
    const start = new Date('2024-01-15T00:00:00Z');
    let cursor = start;
    for (let i = 0; i < 12; i += 1) cursor = nominalPeriodEnd(monthly, cursor);
    expect(cursor.toISOString()).toBe('2025-01-15T00:00:00.000Z');
    expect(RENEWAL_GRACE_MS).toBeGreaterThan(0);
  });
});
