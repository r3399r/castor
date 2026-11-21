/**
 * Which of three states one cell of the growth track is in.
 *
 * A pure function rather than three ternaries inside `GrowthTrack`,
 * because getting it wrong is invisible: the component renders, nothing
 * throws, and the only symptom is a caption that contradicts the card
 * beside it. `vitest.config.ts` runs no component tests on purpose, so
 * logic that needs pinning has to be a function in `lib/` to be pinned
 * at all.
 */
export type GrowthStageState =
  /** Not reached: the track shows the shared locked egg. */
  | 'locked'
  /** Reached, and still earning XP toward the next one. */
  | 'growing'
  /** Reached and done with: the track shows the stage's own label. */
  | 'reached'

/**
 * `level` is the cell, `unlockedLevel` the spirit's own level.
 *
 * The top level is 'reached', never 'growing' -- arriving at it finishes
 * the spirit, and there is no next level to earn XP toward. That case was
 * wrong until 2026-11-21: `level === unlockedLevel` alone decided, so the
 * last cell read 培育中 with a full progress bar under it while the status
 * card next to it said 已完成 and 五個階段，完整收藏. It showed only at LV5,
 * which is the screen that unlocks the donation, and it also meant the
 * LV5 stage label (綻放 for every species) could never render here.
 */
export function growthStageState(
  level: number,
  unlockedLevel: number,
  maxLevel: number
): GrowthStageState {
  if (level > unlockedLevel) return 'locked'
  if (level === unlockedLevel && unlockedLevel < maxLevel) return 'growing'
  return 'reached'
}
