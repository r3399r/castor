/**
 * Which concepts one answer credits.
 *
 * A 題組's parent row carries the *union* of its own concepts and every
 * child's -- the merge in `createOneQuestion` is what keeps the concept
 * filters (all of which require `parent_id IS NULL`) able to find the
 * group at all. So crediting "the child's own, plus the parent's" would
 * credit every sibling's concepts on every answer.
 *
 * It did, until 2026-11-22. A 題組 whose three sub-questions each tested a
 * different concept recorded the same attempt and the same score against
 * all three, so getting one right and one wrong left both at 50%: the
 * concept you knew was dragged down by the one you did not, and the one
 * you did not was propped up by the one you knew. Measured, not inferred
 * -- all three rows came back identical (`attempts 2, scoringTotal 10,
 * mastery 4.722`) from a batch that scored 10 and 0.
 *
 * Subtracting what the siblings claim fixes that and leaves the
 * group-level concepts -- the ones the author put on the parent because
 * the whole group tests them -- still credited. Dropping the parent
 * contribution entirely would be the obvious shortcut and is wrong: those
 * concepts would then be credited by nothing, while
 * `concept.number_of_questions` still counts the group, so adaptive would
 * keep them pinned at mastery 0 forever and the 遺忘風險 list (which
 * requires a non-null `last_attempt_at`) would never show them at all. A
 * user who had answered the group would see "never practised".
 *
 * This is the same split `webapp/lib/questionConcept.ts` uses to decide
 * which chips go on the card header and which on the sub-question, on
 * purpose: what a reader is told the sub-question tests, and what
 * answering it credits, should not be two different answers.
 */
export const conceptIdsForReply = (
  /** The answered question's own links. A standalone question has all of them here. */
  ownConceptIds: readonly number[],
  /** The parent's merged set, or empty when the answer is not to a 題組's child. */
  parentConceptIds: readonly number[],
  /**
   * Every concept any child of that parent links, the answered one
   * included. Siblings outside the current request count too: a concept
   * belongs to the sub-question that names it whether or not that
   * sub-question happened to be answered in the same batch, or the credit
   * would depend on how the client chose to split its submissions.
   */
  siblingClaimedConceptIds: ReadonlySet<number>
): Set<number> => {
  const conceptIds = new Set<number>(ownConceptIds);
  // The answered child's own concepts are in `siblingClaimedConceptIds`
  // too, so this skips them here and the union above puts them back.
  for (const conceptId of parentConceptIds)
    if (!siblingClaimedConceptIds.has(conceptId)) conceptIds.add(conceptId);
  return conceptIds;
};
