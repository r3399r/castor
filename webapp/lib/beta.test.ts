import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isBetaMode, resolveEntitlement, resolveSubscriberOnly } from '@/lib/beta'

describe('isBetaMode', () => {
  const original = process.env.NEXT_PUBLIC_BETA_MODE

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_BETA_MODE
    else process.env.NEXT_PUBLIC_BETA_MODE = original
  })

  it('is on for exactly "true"', () => {
    process.env.NEXT_PUBLIC_BETA_MODE = 'true'
    expect(isBetaMode()).toBe(true)
  })

  it('is off when unset', () => {
    delete process.env.NEXT_PUBLIC_BETA_MODE
    expect(isBetaMode()).toBe(false)
  })

  // Truthy-string parsing would open every paid feature for
  // NEXT_PUBLIC_BETA_MODE=false, which is the one value most likely to
  // be written when someone means to turn it off.
  it.each(['false', 'False', 'TRUE', '1', 'yes', ''])('is off for %o', (value) => {
    process.env.NEXT_PUBLIC_BETA_MODE = value
    expect(isBetaMode()).toBe(false)
  })
})

describe('resolveEntitlement', () => {
  const original = process.env.NEXT_PUBLIC_BETA_MODE

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_BETA_MODE
    else process.env.NEXT_PUBLIC_BETA_MODE = original
  })

  describe('outside beta', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_BETA_MODE = 'false'
    })

    // null, not false: a gated block that reads "not known yet" as "not
    // entitled" shows a subscriber its upgrade prompt for as long as
    // POST /user/sync is in flight.
    it('answers null while sync has not come back', () => {
      expect(resolveEntitlement(null)).toBe(null)
    })

    it('passes through a known entitlement', () => {
      expect(resolveEntitlement({ entitled: true })).toBe(true)
      expect(resolveEntitlement({ entitled: false })).toBe(false)
    })
  })

  describe('in beta', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_BETA_MODE = 'true'
    })

    // Including the null case: there is nothing to wait for, so a gated
    // block must not sit blank until sync answers.
    it('answers true whatever the subscription says', () => {
      expect(resolveEntitlement(null)).toBe(true)
      expect(resolveEntitlement({ entitled: false })).toBe(true)
      expect(resolveEntitlement({ entitled: true })).toBe(true)
    })
  })
})

/**
 * The VIP egg's gate, and the point of it is the one case
 * resolveEntitlement answers differently: beta does not include that
 * egg, so this must keep saying no while the flag is on.
 */
describe('resolveSubscriberOnly', () => {
  const original = process.env.NEXT_PUBLIC_BETA_MODE

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_BETA_MODE
    else process.env.NEXT_PUBLIC_BETA_MODE = original
  })

  it.each(['true', 'false'])('ignores beta mode (%o)', (value) => {
    process.env.NEXT_PUBLIC_BETA_MODE = value
    expect(resolveSubscriberOnly(null)).toBe(null)
    expect(resolveSubscriberOnly({ entitled: false })).toBe(false)
    expect(resolveSubscriberOnly({ entitled: true })).toBe(true)
  })

  // The asymmetry this function exists for, stated as one assertion.
  it('disagrees with resolveEntitlement for a non-subscriber in beta', () => {
    process.env.NEXT_PUBLIC_BETA_MODE = 'true'
    expect(resolveEntitlement({ entitled: false })).toBe(true)
    expect(resolveSubscriberOnly({ entitled: false })).toBe(false)
  })
})
