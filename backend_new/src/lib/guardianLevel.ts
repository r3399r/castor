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
// level, totaling 1,000,000: 25,000 * (1+3+9+27) = 1,000,000.
export const LEVEL_XP_THRESHOLDS = [25_000, 75_000, 225_000, 675_000];

export const MAX_LEVEL = LEVEL_XP_THRESHOLDS.length + 1;

/** The XP needed for the next level, or null for a spirit already maxed. */
export const nextLevelXp = (level: number): number | null =>
  level < MAX_LEVEL ? LEVEL_XP_THRESHOLDS[level - 1] : null;
