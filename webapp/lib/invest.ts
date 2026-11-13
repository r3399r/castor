/**
 * The growth-bonus arithmetic, as this screen states it before the user
 * commits.
 *
 * The server runs the same sum afterwards and its answer is the one that
 * is stored; this exists because the box screen has to show the XP an
 * investment will earn *before* it is made. Two copies of the arithmetic
 * once meant two numbers that nothing kept equal, and the user sees both
 * -- which is why the rate is no longer written down here at all. It
 * comes from `GET /api/info/growth`, and these functions take it as an
 * argument.
 *
 * Taking a rate rather than an `entitled` flag is the point of the
 * signature: entitlement is a question about the viewer and belongs to
 * the component, while this is arithmetic. It also collapses the two
 * reasons there may be no bonus to show -- the viewer has no paid access,
 * or the server has not said what the rate is yet -- into the single
 * thing the screen can render, a rate of 0. See effectiveBonusPercent.
 */

/**
 * What an investment of `points` becomes in XP.
 *
 * Floored, because `user_guardian.xp` is an INT column: at a 10% rate an
 * investment of 5 earns 0 bonus XP, not the 0.5 an earlier estimate here
 * displayed and nothing could ever store.
 *
 * A whole percentage rather than a 0.1 multiplier, and that is not
 * cosmetic: `points * 0.1` is not always what it looks like, because 0.1
 * has no exact binary form. `3 * 0.1` is 0.30000000000000004 and the
 * error has no fixed sign, so a value that should land exactly on an
 * integer can come out just under it and lose a whole XP to the floor
 * below. `(points * 10) / 100` keeps every step on integers until the
 * single division, which IEEE-754 rounds correctly.
 *
 * The spend is always the full `points`: the bonus is growth, never a
 * discount.
 */
export const investmentXp = (points: number, bonusPercent: number): number =>
  points + Math.floor((points * bonusPercent) / 100)

/**
 * The fewest points whose investment reaches `targetXp` -- the inverse of
 * investmentXp, and what the invest slider caps at.
 *
 * Capping at the raw XP gap asks someone earning the bonus to spend
 * points it already covers: 2,500 XP short of a level, they need 2,273 at
 * a 10% rate. The surplus would not have been lost, since xp carries into
 * the next level, but "this stage needs N points" that is 10% too high is
 * wrong, and the cap was asked not to overshoot.
 *
 * Derived rather than searched from zero, then corrected: the closed form
 * `ceil(targetXp * 100 / (100 + rate))` is right for a 10% bonus, but the
 * division is floating point and the bonus is floored, so it can sit one
 * off at another rate or at a boundary. Both loops run a couple of
 * iterations at most and make the answer true by construction -- the
 * smallest points whose investmentXp is not short -- at any rate, which
 * matters now that the rate arrives from the server rather than being a
 * constant compiled in beside this.
 *
 * Reaching the target exactly is not always possible: the bonus moves in
 * whole XP, so 21 XP needs 20 points and grants 22. Overshooting the XP
 * is unavoidable; overshooting the points is not.
 */
export const pointsForXp = (targetXp: number, bonusPercent: number): number => {
  if (targetXp <= 0) return 0
  if (bonusPercent <= 0) return targetXp
  let points = Math.ceil((targetXp * 100) / (100 + bonusPercent))
  while (points > 0 && investmentXp(points - 1, bonusPercent) >= targetXp) points -= 1
  while (investmentXp(points, bonusPercent) < targetXp) points += 1

  return points
}

/**
 * The rate to compute and display with: 0 unless the viewer has paid
 * access *and* the server has said what the rate is.
 *
 * `published` is null until `GET /api/info/growth` answers, and that is
 * not the same as "no bonus" -- but for everything this screen does with
 * it, it is. While the rate is unknown no bonus is stated and the slider
 * caps at the raw XP gap, which is the same state someone with no paid
 * access sees, and which the screen already rendered for the moment
 * before `POST /user/sync` answers with the subscription. So the loading
 * case needs no display of its own; what it must not do is state a rate
 * this client made up, which is the whole reason the constant left.
 *
 * Erring generous rather than tight, deliberately: a cap 10% high asks
 * for points the bonus would have covered, and the surplus carries into
 * the next level rather than being lost. The grant itself is never this
 * number -- the server reads entitlement and the rate for itself on every
 * invest.
 */
export const effectiveBonusPercent = (entitled: boolean, published: number | null): number =>
  entitled && published !== null ? published : 0
