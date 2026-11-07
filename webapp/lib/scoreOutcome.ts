/**
 * How a graded answer should be presented.
 *
 * `score` runs 0-10 and several types award partial credit: MULTIPLE
 * deducts per wrong position, CLOZE gives one blank's worth per correct
 * blank. Collapsing that to a boolean -- which the practice page did, by
 * treating any score above 0 as correct -- tells someone who got 7 of 10
 * blanks right that they 答對了, and then files the question in their
 * 錯題本 anyway, because the backend's rule for that is `score < 10`
 * (see upsertWrongQuestion's call site in backend_new/src/routes/reply.ts).
 * The tick and the 錯題本 contradicted each other.
 *
 * These three states line up with that backend rule instead: only full
 * marks are correct, and anything short of it is a question the user will
 * meet again in 錯題本 -- so `partial` and `wrong` differ in how they are
 * shown, not in what they mean for review.
 */
export type ScoreOutcome = 'correct' | 'partial' | 'wrong'

/** The score a question is worth when every part of it is right. */
export const FULL_SCORE = 10

export const scoreOutcome = (score: number): ScoreOutcome => {
  if (score >= FULL_SCORE) return 'correct'
  return score > 0 ? 'partial' : 'wrong'
}

/**
 * The outcome for a set of responses answered as one unit -- a GROUP's
 * children, or a single question's lone response.
 *
 * Every part right is correct; nothing right at all is wrong; anything
 * between is partial. A GROUP with one child right and one wrong used to
 * read as a flat 答錯, which hid the half that was fine.
 */
export const combinedOutcome = (scores: number[]): ScoreOutcome => {
  if (scores.length === 0) return 'wrong'
  if (scores.every((score) => scoreOutcome(score) === 'correct')) return 'correct'
  return scores.some((score) => score > 0) ? 'partial' : 'wrong'
}
