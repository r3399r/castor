import { describe, expect, it } from 'vitest'
import { growthStageState } from './growthStage'

/** The five cells of one spirit's track, as the component walks them. */
const track = (unlockedLevel: number, maxLevel = 5) =>
  [1, 2, 3, 4, 5].map((level) => growthStageState(level, unlockedLevel, maxLevel))

describe('growthStageState', () => {
  it('marks the level in progress and locks the ones above it', () => {
    expect(track(3)).toEqual(['reached', 'reached', 'growing', 'locked', 'locked'])
  })

  it('has nothing reached on a freshly hatched spirit', () => {
    expect(track(1)).toEqual(['growing', 'locked', 'locked', 'locked', 'locked'])
  })

  // The bug this function exists for. The top cell used to come out
  // 'growing', so the track read 培育中 with a progress bar while the card
  // beside it said 已完成 -- and the LV5 stage label could never render.
  it('calls the top level reached, not growing', () => {
    expect(track(5)).toEqual(['reached', 'reached', 'reached', 'reached', 'reached'])
    expect(growthStageState(5, 5, 5)).toBe('reached')
  })

  it('still calls the second-to-top level growing', () => {
    // The level below the top is the last one that really is in progress,
    // so the fix must not have shifted the boundary by one.
    expect(growthStageState(4, 4, 5)).toBe('growing')
  })

  it('reads a level past the maximum as reached rather than locked', () => {
    // Not expected from the API, but a stale cached guardian could carry
    // it, and a spirit the user owns must not render as locked.
    expect(growthStageState(5, 6, 5)).toBe('reached')
  })
})
