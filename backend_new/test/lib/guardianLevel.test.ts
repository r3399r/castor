import { describe, expect, it } from 'vitest';
import {
  LEVEL_XP_THRESHOLDS,
  SUBSCRIBER_XP_BONUS_PERCENT,
  investmentXp,
  pointsForXp,
} from 'src/lib/guardianLevel';

/**
 * The subscriber growth bonus.
 *
 * Worth its own test for one reason: the number the user is promised
 * before they confirm is computed in the webapp, and the number they
 * actually get is computed here. Both have to produce the same integer
 * for the same input, so the exact rounding is the contract -- not an
 * implementation detail.
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
    // accident. It is defined once, in @castor/shared, and the webapp
    // imports the same value -- so this guards the number itself, not
    // the two sides agreeing.
    expect(SUBSCRIBER_XP_BONUS_PERCENT).toBe(10);
  });
});

/**
 * The inverse, which caps the invest slider.
 *
 * Nothing on the server calls it -- the grant never needs it -- but it
 * decides how many points the box page lets a user spend, and that is
 * exactly why it is tested here rather than nowhere: the webapp has no
 * test setup, and an off-by-one makes the user either overspend or stop
 * one point short of a level.
 */
describe('pointsForXp', () => {
  it('asks for the full gap without the bonus', () => {
    expect(pointsForXp(2_500, false)).toBe(2_500);
    expect(pointsForXp(1, false)).toBe(1);
  });

  it('discounts the gap by the bonus for a subscriber', () => {
    // The case the cap got wrong: a fresh spirit is 2,500 XP from LV2,
    // and 2,273 points reach it once the 227 XP bonus is counted.
    expect(pointsForXp(2_500, true)).toBe(2_273);
    expect(investmentXp(2_273, true)).toBe(2_500);
  });

  it('is the smallest sufficient number of points', () => {
    // The property, over every XP gap a level can present plus the
    // small numbers where the floor bites hardest. One point fewer has
    // to fall short; the answer itself must not.
    const targets = [1, 2, 9, 10, 11, 12, 20, 21, 99, 100, ...LEVEL_XP_THRESHOLDS];
    for (const target of targets) {
      for (const entitled of [false, true]) {
        const points = pointsForXp(target, entitled);
        expect(investmentXp(points, entitled)).toBeGreaterThanOrEqual(target);
        expect(investmentXp(points - 1, entitled)).toBeLessThan(target);
      }
    }
  });

  it('asks for nothing at or past the target', () => {
    // A maxed spirit has no next level, which reaches here as a gap of
    // zero; a negative gap would mean xp already past the threshold.
    expect(pointsForXp(0, true)).toBe(0);
    expect(pointsForXp(-5, true)).toBe(0);
  });

  it('returns whole points', () => {
    for (const target of [7, 2_500, 7_500, 22_500, 67_500]) {
      expect(Number.isInteger(pointsForXp(target, true))).toBe(true);
    }
  });
});
