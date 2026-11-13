import { describe, expect, it } from 'vitest'
import {
  artworkByCode,
  spiritCatalog,
  spiritImage,
  type SpiritSpecies,
} from './guardianArtwork'

describe('spiritImage', () => {
  it('names the file for the spirit and level', () => {
    expect(spiritImage('cat', 3)).toBe('/illustrations/guardians/cat/lv3.webp')
  })

  it('clamps to the five levels that have artwork', () => {
    // A level outside 1-5 is not a bug to surface as a broken image: the
    // caller passes whatever user_guardian.level holds.
    expect(spiritImage('cat', 0)).toBe('/illustrations/guardians/cat/lv1.webp')
    expect(spiritImage('cat', -4)).toBe('/illustrations/guardians/cat/lv1.webp')
    expect(spiritImage('cat', 5)).toBe('/illustrations/guardians/cat/lv5.webp')
    expect(spiritImage('cat', 99)).toBe('/illustrations/guardians/cat/lv5.webp')
  })

  it('truncates a fractional level rather than asking for lv3.7.webp', () => {
    expect(spiritImage('cat', 3.7)).toBe('/illustrations/guardians/cat/lv3.webp')
  })

  it('returns undefined for a spirit that has no artwork yet', () => {
    // A normal state, not an error -- the caller shows the locked egg.
    expect(spiritCatalog.dolphin.artwork).toBeUndefined()
    expect(spiritImage('dolphin', 1)).toBeUndefined()
  })
})

describe('the catalog and the code mapping', () => {
  it('maps every guardian.code to a spirit the catalog knows', () => {
    // A code pointing at a missing species would render as the locked egg
    // on one screen and throw on another.
    for (const [code, species] of Object.entries(artworkByCode)) {
      expect(species, code).toBeDefined()
      expect(Object.keys(spiritCatalog)).toContain(species as string)
    }
  })

  it('gives every drawn spirit a name, a category and five stage labels', () => {
    for (const [species, definition] of Object.entries(spiritCatalog)) {
      expect(definition.name, species).not.toBe('')
      expect(definition.category, species).not.toBe('')
      // The stage labels are indexed by level, so a drawn spirit with
      // fewer than five would render an empty caption at some level.
      if (definition.artwork) expect(definition.stages, species).toHaveLength(5)
    }
  })

  it('has no two spirits sharing a category', () => {
    // organizationsFor (donationDemo) picks the category from the spirit,
    // so two spirits on one category would make that lookup ambiguous.
    const categories = Object.values(spiritCatalog).map((item) => item.category)
    expect(new Set(categories).size).toBe(categories.length)
  })

  it('points each artwork path at its own species directory', () => {
    for (const [species, definition] of Object.entries(spiritCatalog)) {
      if (definition.artwork) {
        expect(definition.artwork, species).toBe(
          `/illustrations/guardians/${species as SpiritSpecies}`
        )
      }
    }
  })
})
