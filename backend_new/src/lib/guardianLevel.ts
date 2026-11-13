/**
 * How far a spirit has grown.
 *
 * These used to be module constants inside routes/guardian.ts, which was
 * fine while that route was the only thing that cared. The donation
 * routes care too -- a donation is bought with a *maxed* spirit -- and
 * MAX_LEVEL is exactly the sort of constant that must not exist twice:
 * two copies that drift mean "maxed" quietly means one thing when the
 * level-up runs and another when the donation is confirmed.
 */

// XP required to advance from level N to N+1, index 0 = level 1->2.
// Separate from the redeem cost (store.ts) -- this is purely the growing
// budget, not counting whatever was spent buying the egg. Ratio 3 per
// level, totaling 100,000: 2,500 * (1+3+9+27) = 100,000.
//
// Was 1,000,000 until 2026-11-10. The total is a product decision, not a
// tuning constant: it sets how often a user reaches LV5, and LV5 is what
// commits the platform to a real donation. POINTS.md carries the
// derivation and, more importantly, the fact that this number, the
// donation amount and the subscription price are locked together --
// changing one alone breaks the arithmetic in that file.
//
// Lowering it is the safe direction: every stored `user_guardian.xp` now
// goes further, so nobody loses progress. Raising it would strand users
// mid-level, which is why POINTS.md says to start high and come down.
export const LEVEL_XP_THRESHOLDS = [2_500, 7_500, 22_500, 67_500];

export const MAX_LEVEL = LEVEL_XP_THRESHOLDS.length + 1;

/** The XP needed for the next level, or null for a spirit already maxed. */
export const nextLevelXp = (level: number): number | null =>
  level < MAX_LEVEL ? LEVEL_XP_THRESHOLDS[level - 1] : null;

/**
 * The subscriber growth bonus.
 *
 * This is the definition. It used to live in `@castor/shared` so the
 * webapp could compute the same sum to show the user before confirming,
 * which worked only because both halves were built from one checkout --
 * a shared constant is not a contract, it is a build coincidence. The
 * webapp now reads the rate from `GET /api/info/growth`, which serves
 * this value, so there is one source and it travels over the wire.
 *
 * A whole percentage rather than a 0.1 multiplier, and that is not
 * cosmetic: `points * 0.1` is not always what it looks like, because 0.1
 * has no exact binary form. `3 * 0.1` is 0.30000000000000004 and the
 * error has no fixed sign, so a value that should land exactly on an
 * integer can come out just under it and lose a whole XP to the floor
 * below. `(points * 10) / 100` keeps every step on integers until the
 * single division, which IEEE-754 rounds correctly.
 */
export const SUBSCRIBER_XP_BONUS_PERCENT = 10;

/**
 * What an investment of `points` becomes in XP -- the grant itself.
 *
 * Floored, because `user_guardian.xp` is an INT column: an investment of
 * 5 earns 0 bonus XP rather than the 0.5 an earlier frontend estimate
 * displayed and nothing could ever store.
 *
 * `entitled` means paid access, which is broader than "subscribed" -- see
 * findEntitledSubscription. A cancelled agreement still inside its paid
 * period earns the bonus, because the period is paid for, and so does a
 * day pass, which has no agreement at all. This server reads that for
 * itself on every invest; what a client sends is never consulted.
 *
 * The spend is always the full `points`: the bonus is growth, never a
 * discount.
 *
 * `webapp/lib/invest.ts` runs the same arithmetic to state the sum before
 * the investment, parameterised by the rate it fetched. The rate can no
 * longer differ, but the rounding still could, so both sides are tested
 * against the same worked examples -- 100 -> 110, 5 -> 5, 2,273 -> 2,500.
 * Change the rounding here and `webapp/lib/invest.test.ts` is the other
 * place to look.
 */
export const investmentXp = (points: number, entitled: boolean): number =>
  points + (entitled ? Math.floor((points * SUBSCRIBER_XP_BONUS_PERCENT) / 100) : 0);
