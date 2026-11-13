import { describe, expect, it } from 'vitest'
import { effectiveBonusPercent, investmentXp, pointsForXp } from './invest'

/**
 * The XP levels a spirit advances at, copied rather than imported.
 *
 * `LEVEL_XP_THRESHOLDS` is the server's, and the webapp has no business
 * holding it -- what it uses are the `nextLevelXp` values the API sends
 * per spirit. These are here only as realistic gaps to test against, so
 * drifting from the server's thresholds would not make this test wrong.
 */
const LEVEL_GAPS = [2_500, 7_500, 22_500, 67_500]

/**
 * What the screen states an investment will earn.
 *
 * The grant itself is `investmentXp` in `backend_new/src/lib/
 * guardianLevel.ts`, and the two have to produce the same integer for the
 * same input or the user is promised one number and given another. The
 * rate can no longer differ -- it comes from GET /api/info/growth, and
 * the backend's regression test checks the published number against the
 * granting function -- but the rounding is still written on both sides,
 * so these worked examples are deliberately the same ones that suite
 * uses: 100 -> 110, 5 -> 5, 2,273 -> 2,500.
 *
 * These tests inherit the cases that lived in
 * `backend_new/test/lib/guardianLevel.test.ts` while the arithmetic was
 * in `packages/shared`. `pointsForXp` is here and nowhere else now:
 * nothing on the server ever called it.
 */
describe('investmentXp', () => {
  it('adds nothing at a rate of zero', () => {
    // A rate of 0 is both "no paid access" and "the rate has not arrived
    // yet" -- see effectiveBonusPercent.
    expect(investmentXp(100, 0)).toBe(100)
    expect(investmentXp(1, 0)).toBe(1)
  })

  it('adds the rate', () => {
    // The worked example printed on the subscription page.
    expect(investmentXp(100, 10)).toBe(110)
    expect(investmentXp(2_500, 10)).toBe(2_750)
  })

  it('rounds the bonus down, because xp is an integer column', () => {
    // 5 at 10% would earn 0.5, which user_guardian.xp cannot hold. An
    // earlier frontend estimate displayed it anyway.
    expect(investmentXp(5, 10)).toBe(5)
    expect(investmentXp(9, 10)).toBe(9)
    expect(investmentXp(10, 10)).toBe(11)
    expect(investmentXp(19, 10)).toBe(20)
  })

  it('never loses an XP to binary rounding', () => {
    // The reason the rate is a whole percentage and not 0.1: for these
    // inputs `points * 0.1` lands just above or just below the exact
    // answer, and Math.floor of a value that fell short would silently
    // state one XP less than the server grants.
    for (const points of [3, 7, 29, 70, 700, 2_050, 7_000, 67_500]) {
      expect(investmentXp(points, 10)).toBe(points + Math.trunc(points / 10))
    }
  })

  it('holds at a rate the server has never served', () => {
    // The rate is the server's to change, and this file must not be the
    // thing that assumes 10. 7% is the awkward case: 100 -> 107, and 14
    // -> 14 because 0.98 floors away.
    expect(investmentXp(100, 7)).toBe(107)
    expect(investmentXp(14, 7)).toBe(14)
    expect(investmentXp(15, 7)).toBe(16)
    expect(investmentXp(100, 100)).toBe(200)
  })
})

/**
 * The inverse, which caps the invest slider.
 *
 * Nothing on the server calls it -- the grant never needs it -- but it
 * decides how many points the box page lets a user spend, and an
 * off-by-one makes them either overspend or stop one point short of a
 * level.
 */
describe('pointsForXp', () => {
  it('asks for the full gap at a rate of zero', () => {
    expect(pointsForXp(2_500, 0)).toBe(2_500)
    expect(pointsForXp(1, 0)).toBe(1)
  })

  it('discounts the gap by the bonus', () => {
    // The case the cap got wrong: a fresh spirit is 2,500 XP from LV2,
    // and 2,273 points reach it once the 227 XP bonus is counted.
    expect(pointsForXp(2_500, 10)).toBe(2_273)
    expect(investmentXp(2_273, 10)).toBe(2_500)
  })

  it('is the smallest sufficient number of points, at any rate', () => {
    // The property, over every XP gap a level can present plus the small
    // numbers where the floor bites hardest. One point fewer has to fall
    // short; the answer itself must not.
    //
    // Run across several rates, which the shared version could not be:
    // the closed form it starts from is exact for 10% and can sit one off
    // elsewhere, and the two correcting loops are what make it true
    // anyway. Now that the rate arrives from the server, that stopped
    // being a hypothetical.
    const targets = [1, 2, 9, 10, 11, 12, 20, 21, 99, 100, ...LEVEL_GAPS]
    for (const rate of [0, 1, 7, 10, 33, 100]) {
      for (const target of targets) {
        const points = pointsForXp(target, rate)
        expect(investmentXp(points, rate)).toBeGreaterThanOrEqual(target)
        expect(investmentXp(points - 1, rate)).toBeLessThan(target)
      }
    }
  })

  it('asks for nothing at or past the target', () => {
    // A maxed spirit has no next level, which reaches here as a gap of
    // zero; a negative gap would mean xp already past the threshold.
    expect(pointsForXp(0, 10)).toBe(0)
    expect(pointsForXp(-5, 10)).toBe(0)
  })

  it('returns whole points', () => {
    for (const target of [7, 2_500, 7_500, 22_500, 67_500]) {
      expect(Number.isInteger(pointsForXp(target, 10))).toBe(true)
    }
  })
})

/**
 * The one place "no bonus to show" is decided.
 *
 * Two different situations collapse here, and keeping them apart anywhere
 * else would mean every call site handling both: the viewer has no paid
 * access, or the server has not said what the rate is yet.
 */
describe('effectiveBonusPercent', () => {
  it('is the published rate for a viewer with paid access', () => {
    expect(effectiveBonusPercent(true, 10)).toBe(10)
    expect(effectiveBonusPercent(true, 7)).toBe(7)
  })

  it('is zero without paid access, whatever the rate', () => {
    expect(effectiveBonusPercent(false, 10)).toBe(0)
  })

  it('is zero while the rate is unknown', () => {
    // The point of the function. null is "not known yet", and treating it
    // as a plausible 10 is exactly what moving the rate to the server
    // removed -- so it reads as no bonus until the server answers.
    expect(effectiveBonusPercent(true, null)).toBe(0)
    expect(effectiveBonusPercent(false, null)).toBe(0)
  })

  it('passes a served zero through rather than inventing one', () => {
    // A rate of 0 is a thing the server may legitimately serve, and it
    // must not be confused with the unknown case. Both render the same,
    // but only one of them is an answer.
    expect(effectiveBonusPercent(true, 0)).toBe(0)
  })
})
