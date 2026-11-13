import { describe, expect, it } from 'vitest'
import { FULL_SCORE, combinedOutcome, scoreOutcome } from './scoreOutcome'

/**
 * The boundary these three states exist for is `score < 10`, which is the
 * rule the backend uses to file a question in 錯題本
 * (upsertWrongQuestion, backend_new/src/routes/reply.ts). Anything that
 * treats "score > 0" as correct tells a user who got 7 of 10 blanks that
 * they 答對了 and then files it as wrong anyway.
 */
describe('scoreOutcome', () => {
  it('calls only full marks correct', () => {
    expect(scoreOutcome(FULL_SCORE)).toBe('correct')
    expect(scoreOutcome(9)).toBe('partial')
    expect(scoreOutcome(9.9)).toBe('partial')
  })

  it('treats anything earned but short of full as partial', () => {
    expect(scoreOutcome(1)).toBe('partial')
    expect(scoreOutcome(7)).toBe('partial')
  })

  it('treats nothing earned as wrong', () => {
    expect(scoreOutcome(0)).toBe('wrong')
    // MULTIPLE deducts per wrong position and can go below zero.
    expect(scoreOutcome(-2)).toBe('wrong')
  })

  it('does not cap above full marks', () => {
    expect(scoreOutcome(FULL_SCORE + 1)).toBe('correct')
  })
})

describe('combinedOutcome', () => {
  it('needs every part of a group right to be correct', () => {
    expect(combinedOutcome([10, 10, 10])).toBe('correct')
    expect(combinedOutcome([10, 9])).toBe('partial')
  })

  it('reads a group with something right as partial, not wrong', () => {
    // The flat 答錯 this replaced hid the half that was fine.
    expect(combinedOutcome([10, 0])).toBe('partial')
    expect(combinedOutcome([3, 0])).toBe('partial')
  })

  it('is wrong only when no part earned anything', () => {
    expect(combinedOutcome([0, 0])).toBe('wrong')
    expect(combinedOutcome([-1, 0])).toBe('wrong')
  })

  it('is wrong for no responses at all', () => {
    // A group whose children have not been answered must not read as a
    // correct answer by vacuous truth -- `every` on an empty array is
    // true, which is why the length check comes first.
    expect(combinedOutcome([])).toBe('wrong')
  })

  it('handles a single response, which is how a lone question arrives', () => {
    expect(combinedOutcome([10])).toBe('correct')
    expect(combinedOutcome([4])).toBe('partial')
    expect(combinedOutcome([0])).toBe('wrong')
  })
})
