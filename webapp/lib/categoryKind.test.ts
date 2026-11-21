import { describe, expect, it } from 'vitest'
import { groupCategoriesByKind, resolveActiveKind } from './categoryKind'
import type { CategoryKind } from '@/types/api'

const kinds: CategoryKind[] = [
  { code: 'admission', name: '入學考試', sortOrder: 1 },
  { code: 'national', name: '國家考試', sortOrder: 2 },
  { code: 'license', name: '專技證照', sortOrder: 3 },
]

const category = (id: number, name: string, kind: string) => ({ id, name, kind })

describe('groupCategoriesByKind', () => {
  it('groups in the order the server gave, not the order the rows arrived', () => {
    const groups = groupCategoriesByKind(kinds, [
      category(3, '律師執照', 'license'),
      category(1, '學測', 'admission'),
      category(2, '司法特考', 'national'),
    ])

    expect(groups.map((g) => g.kind.code)).toEqual(['admission', 'national', 'license'])
    expect(groups.map((g) => g.categories.map((c) => c.name))).toEqual([
      ['學測'],
      ['司法特考'],
      ['律師執照'],
    ])
  })

  it('sorts by sortOrder rather than trusting the array', () => {
    const shuffled = [kinds[2], kinds[0], kinds[1]]
    const groups = groupCategoriesByKind(shuffled, [])
    expect(groups.map((g) => g.kind.code)).toEqual(['admission', 'national', 'license'])
  })

  // The card still has to render, as 尚未開放 -- which is the state the
  // national and licence families are in today.
  it('keeps a family with no categories', () => {
    const groups = groupCategoriesByKind(kinds, [category(1, '學測', 'admission')])
    expect(groups).toHaveLength(3)
    expect(groups[1].categories).toEqual([])
    expect(groups[2].categories).toEqual([])
  })

  it('adds a family for a code the server did not serve, rather than dropping the row', () => {
    const groups = groupCategoriesByKind(kinds, [
      category(1, '學測', 'admission'),
      category(9, '研究所', 'postgraduate'),
    ])

    expect(groups).toHaveLength(4)
    const orphan = groups[3]
    expect(orphan.kind.code).toBe('postgraduate')
    // Labelled with the raw code: there is no name to print, and printing
    // nothing would hide the row.
    expect(orphan.kind.name).toBe('postgraduate')
    expect(orphan.categories.map((c) => c.name)).toEqual(['研究所'])
  })

  it('returns nothing before the catalogue has arrived', () => {
    expect(groupCategoriesByKind([], [])).toEqual([])
  })

  it('still shows categories when the catalogue failed to load', () => {
    const groups = groupCategoriesByKind([], [category(1, '學測', 'admission')])
    expect(groups.map((g) => g.kind.code)).toEqual(['admission'])
    expect(groups[0].categories).toHaveLength(1)
  })
})

describe('resolveActiveKind', () => {
  it('keeps a code the server serves', () => {
    expect(resolveActiveKind(kinds, 'license')).toBe('license')
  })

  // A draft saved before a family was renamed or removed.
  it('falls back to the first family for a code that is gone', () => {
    expect(resolveActiveKind(kinds, 'postgraduate')).toBe('admission')
  })

  it('falls back to the first by sortOrder, not by array position', () => {
    expect(resolveActiveKind([kinds[2], kinds[1], kinds[0]], '')).toBe('admission')
  })

  it('is empty before the catalogue has arrived, so no tab is highlighted', () => {
    expect(resolveActiveKind([], 'admission')).toBe('')
  })
})
