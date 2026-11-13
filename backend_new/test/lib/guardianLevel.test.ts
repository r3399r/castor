import { describe, expect, it } from 'vitest';
import { SUBSCRIBER_XP_BONUS_PERCENT, investmentXp } from 'src/lib/guardianLevel';

/**
 * The subscriber growth bonus -- the grant itself.
 *
 * Worth its own test for one reason: the number the user is promised
 * before they confirm is computed in the webapp, and the number they
 * actually get is computed here. Both have to produce the same integer
 * for the same input, so the exact rounding is the contract, not an
 * implementation detail.
 *
 * The rate can no longer differ -- the webapp reads it from
 * GET /api/info/growth, which serves the constant below, and
 * regression/routes/info.test.ts checks the published number against this
 * function. What is still written twice is the rounding, so the worked
 * examples here and in `webapp/lib/invest.test.ts` are deliberately the
 * same: 100 -> 110, 5 -> 5, 2,273 -> 2,500.
 */
describe('investmentXp', () => {
  it('adds nothing without paid access', () => {
    expect(investmentXp(100, false)).toBe(100);
    expect(investmentXp(1, false)).toBe(1);
  });

  it('adds 10% with paid access', () => {
    // The worked example printed on the subscription page.
    expect(investmentXp(100, true)).toBe(110);
    expect(investmentXp(2_500, true)).toBe(2_750);
  });

  it('rounds the bonus down, because xp is an integer column', () => {
    // 5 would earn 0.5, which user_guardian.xp cannot hold. The old
    // frontend estimate displayed it anyway.
    expect(investmentXp(5, true)).toBe(5);
    expect(investmentXp(9, true)).toBe(9);
    expect(investmentXp(10, true)).toBe(11);
    expect(investmentXp(19, true)).toBe(20);
  });

  it('never loses an XP to binary rounding', () => {
    // The reason the rate is an integer percentage and not 0.1: for
    // these inputs `points * 0.1` lands just above or just below the
    // exact answer, and Math.floor of a value that fell short would
    // silently pay out one XP less.
    for (const points of [3, 7, 29, 70, 700, 2_050, 7_000, 67_500]) {
      expect(investmentXp(points, true)).toBe(points + Math.trunc(points / 10));
    }
  });

  it('states the rate as an integer percentage', () => {
    // The rate is a product decision, pinned so it cannot be nudged by
    // accident. POINTS.md has the derivation and the fact that it is
    // locked to the XP total and the donation amount.
    expect(SUBSCRIBER_XP_BONUS_PERCENT).toBe(10);
  });
});
