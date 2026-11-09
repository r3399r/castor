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
