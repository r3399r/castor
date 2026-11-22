import { describe, expect, it } from 'vitest'
import { groupLevelConcepts } from './questionConcept'

const concept = (id: number, name: string) => ({
  id,
  name,
  conceptGroup: { id: 1, name: '群組' },
})

const child = (...concepts: ReturnType<typeof concept>[]) => ({ concept: concepts })

describe('groupLevelConcepts', () => {
  it('returns the parent set unchanged when no child claims anything', () => {
    const parent = [concept(1, '極限'), concept(2, '導函數')]

    expect(groupLevelConcepts(parent, [child(), child()])).toEqual(parent)
  })

  it('returns the parent set unchanged for a standalone question, which has no children', () => {
    const parent = [concept(1, '極限')]

    expect(groupLevelConcepts(parent, [])).toEqual(parent)
  })

  it('drops a concept a sub-question prints for itself', () => {
    const parent = [concept(1, '極限'), concept(2, '導函數'), concept(3, '積分')]

    const left = groupLevelConcepts(parent, [child(concept(2, '導函數'))])

    expect(left.map((c) => c.id)).toEqual([1, 3])
  })

  it('drops a concept claimed by any child, not only the first', () => {
    const parent = [concept(1, '極限'), concept(2, '導函數'), concept(3, '積分')]

    const left = groupLevelConcepts(parent, [
      child(concept(3, '積分')),
      child(concept(1, '極限')),
    ])

    expect(left.map((c) => c.id)).toEqual([2])
  })

  it('empties the header when the children between them claim every concept', () => {
    const parent = [concept(1, '極限'), concept(2, '導函數')]

    expect(
      groupLevelConcepts(parent, [child(concept(1, '極限')), child(concept(2, '導函數'))])
    ).toEqual([])
  })

  // The parent holds the union of its own and the children's, so a child
  // concept missing from the parent should not happen. If a hand-written
  // row makes it happen anyway, the child's own chip still shows it -- this
  // function only ever removes from the header, never adds.
  it('ignores a child concept the parent does not carry', () => {
    const parent = [concept(1, '極限')]

    expect(groupLevelConcepts(parent, [child(concept(9, '矩陣'))])).toEqual(parent)
  })
})
