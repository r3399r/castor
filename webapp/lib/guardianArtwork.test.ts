import { describe, expect, it } from 'vitest'
import {
  artworkFor,
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

  it('ships the newly completed rights and VIP artwork sets', () => {
    expect(spiritCatalog.penguin.artwork).toBe('/illustrations/guardians/penguin')
    expect(spiritCatalog.fennec.artwork).toBe('/illustrations/guardians/fennec')
  })
})

describe('artworkFor', () => {
  it('resolves a guardian.code to the species of the same name', () => {
    // The codes name the species drawn since 2026-11-21, so this is the
    // identity map with a membership check -- which is the whole reason
    // the artworkByCode table could be deleted.
    expect(artworkFor('penguin')).toBe('penguin')
    expect(artworkFor('fennec')).toBe('fennec')
  })

  it('returns undefined for a code the catalog does not draw', () => {
    // Not a bug to surface: a row may exist before its artwork ships, and
    // every caller falls back to the locked egg. 'forest' is deliberate --
    // it is what the forest egg's code used to be, and nothing should
    // resolve it any more.
    expect(artworkFor('forest')).toBeUndefined()
    expect(artworkFor('vip')).toBeUndefined()
    expect(artworkFor('')).toBeUndefined()
  })

  it('refuses a catalog entry that has no artwork', () => {
    // Guards the one hazard the old table allowed: naming a species whose
    // files are not shipped, so spiritImage returns undefined while the
    // caller believes there is a picture. Every entry is drawn today, so
    // this asserts the rule rather than a current gap.
    const undrawn = (Object.keys(spiritCatalog) as SpiritSpecies[]).filter(
      (key) => spiritCatalog[key].artwork === undefined
    )
    for (const key of undrawn) expect(artworkFor(key), key).toBeUndefined()
  })
})

describe('the catalog', () => {
  // A 'has no two spirits sharing a category' case stood here until
  // 2026-11-21, protecting a donation demo's organization list against a
  // duplicate. The catalog has no `category` field any more -- naming the
  // cause is the database's job -- and that demo is gone too, so there is
  // nothing left here for such a test to be about.

  it('gives every drawn spirit a name and five stage labels', () => {
    for (const [species, definition] of Object.entries(spiritCatalog)) {
      expect(definition.name, species).not.toBe('')
      // The stage labels are indexed by level, so a drawn spirit with
      // fewer than five would render an empty caption at some level.
      if (definition.artwork) expect(definition.stages, species).toHaveLength(5)
    }
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
