import type { Question } from '@/types/api'

type Concept = Question['concept'][number]

/**
 * The concepts a 題組's header should print, given that its sub-questions
 * now print their own.
 *
 * A group's parent row carries the *union* of its own concepts and every
 * child's (see `createOneQuestion` -- the merge is what keeps the concept
 * filters, which all require `parent_id IS NULL`, able to find the group
 * at all). So printing the parent's set in the header and each child's on
 * the child would show most concepts twice: once up top and once beside
 * the sub-question it came from.
 *
 * Subtracting what the children claim splits the two cleanly. The header
 * keeps the concepts the group tests as a whole -- the ones no single
 * sub-question was tagged with -- and each sub-question keeps its own.
 *
 * A 題組 authored before 2026-11-22 has no per-child concepts, so nothing
 * is claimed and this returns the parent's set unchanged: those cards read
 * exactly as they always did.
 *
 * `backend_new/src/lib/questionConcept.ts` applies the same split to
 * decide which concepts an answer credits in `user_concept_stat`. The two
 * are deliberately the same rule: what a reader is told a sub-question
 * tests, and what answering it moves, should not be two different
 * answers. They are separate files because the two packages share no
 * code, so a change to one belongs in both.
 */
export function groupLevelConcepts(
  parentConcepts: readonly Concept[],
  children: readonly { concept: readonly Concept[] }[]
): Concept[] {
  const claimed = new Set(children.flatMap((child) => child.concept.map((c) => c.id)))
  return parentConcepts.filter((concept) => !claimed.has(concept.id))
}
