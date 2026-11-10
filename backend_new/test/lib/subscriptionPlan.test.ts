import { describe, expect, it } from 'vitest';
import {
  PLANS,
  RENEWAL_GRACE_MS,
  dayPassEnd,
  findDayPassPlan,
  findPlan,
  findRecurringPlan,
  isDayPassPlan,
  isRecurringPlan,
  nominalPeriodEnd,
} from 'src/lib/subscriptionPlan';

const monthly = findRecurringPlan('monthly')!;

describe('the plan catalog', () => {
  it('satisfies the limits ECPay enforces on a recurring order', () => {
    for (const plan of PLANS.filter(isRecurringPlan)) {
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

  it('prices every day pass as a whole number of NTD for a whole number of days', () => {
    const passes = PLANS.filter(isDayPassPlan);
    expect(passes.length).toBeGreaterThan(0);
    for (const plan of passes) {
      expect(Number.isInteger(plan.amount)).toBe(true);
      expect(plan.amount).toBeGreaterThan(0);
      expect(Number.isInteger(plan.days)).toBe(true);
      expect(plan.days).toBeGreaterThan(0);
      // smallint unsigned on payment_purchase.days.
      expect(plan.days).toBeLessThanOrEqual(65535);
    }
  });

  it('makes a longer pass cheaper per day than a shorter one', () => {
    // Not a style rule: a pass that costs more per day than a shorter one
    // is a pricing mistake nobody would choose, and the catalog is the
    // only place it could be caught.
    const passes = [...PLANS.filter(isDayPassPlan)].sort((a, b) => a.days - b.days);
    for (let i = 1; i < passes.length; i += 1)
      expect(passes[i].amount / passes[i].days).toBeLessThan(
        passes[i - 1].amount / passes[i - 1].days
      );
  });

  it('has a unique code per plan, since the code is what is stored', () => {
    const codes = PLANS.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('separates the two kinds, so a lookup cannot return the wrong shape', () => {
    // findRecurringPlan feeding renewSubscriptionPeriod and
    // findDayPassPlan feeding extendSubscriptionByDays is what keeps a
    // one-time purchase from being treated as an agreement, and the
    // webhook relies on exactly this.
    expect(findRecurringPlan('monthly')).toBeDefined();
    expect(findDayPassPlan('monthly')).toBeUndefined();
    expect(findDayPassPlan('days30')).toBeDefined();
    expect(findRecurringPlan('days30')).toBeUndefined();
  });

  it('no longer offers the retired annual plan', () => {
    // Retired 2026-11-10. findPlan returning undefined is what the
    // webhook's unknown-plan branch handles, so this pins that the code
    // really is gone rather than merely unused.
    expect(findPlan('annual')).toBeUndefined();
  });
});

describe('dayPassEnd', () => {
  it('adds exactly the days sold, whichever months they span', () => {
    // Plain days, not calendar months: "90 天" has to be 90 days, so
    // somebody buying in February must not get a shorter pass than
    // somebody buying in March.
    const feb = dayPassEnd(findDayPassPlan('days30')!, new Date('2024-02-01T00:00:00Z'));
    expect(feb.toISOString()).toBe('2024-03-02T00:00:00.000Z');

    const mar = dayPassEnd(findDayPassPlan('days30')!, new Date('2024-03-01T00:00:00Z'));
    expect(mar.toISOString()).toBe('2024-03-31T00:00:00.000Z');
  });

  it('adds no grace, unlike a recurring period', () => {
    // A pass is paid up front with nothing scheduled after it, so there
    // is no provider clock to be out of step with -- grace here would be
    // three free days on every purchase, 10% of the 30-day plan.
    const start = new Date('2024-01-01T00:00:00Z');
    const end = dayPassEnd(findDayPassPlan('days30')!, start);
    expect(end.getTime() - start.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

// Declared here, not in the catalog: the annual plan was retired, but
// nominalPeriodEnd still handles periodType 'Y' and its day-of-month
// clamping is the subtlest arithmetic in the file. Deleting the coverage
// along with the plan would leave that path untested for whenever a
// yearly plan comes back.
const annual = {
  kind: 'recurring' as const,
  code: 'monthly' as const,
  amount: 1990,
  periodType: 'Y' as const,
  frequency: 1,
  execTimes: 20,
  itemName: 'test yearly',
  tradeDesc: 'test yearly',
};

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
