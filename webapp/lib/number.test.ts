import { describe, expect, it } from 'vitest'
import { formatNumber } from './number'

/**
 * The point of this module is that the locale is *pinned*, so the cases
 * assert the rendered string rather than comparing against another
 * `toLocaleString` call -- which would pass however the grouping came out
 * and so would check nothing. `1.250` instead of `1,250` is exactly the
 * failure this is here to stop.
 */
describe('formatNumber', () => {
  it('groups thousands the way zh-TW does', () => {
    expect(formatNumber(1_250)).toBe('1,250')
    expect(formatNumber(100_000)).toBe('100,000')
    expect(formatNumber(1_000_000)).toBe('1,000,000')
  })

  it('leaves a number below a thousand alone', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(999)).toBe('999')
  })

  it('keeps the sign and the decimal part', () => {
    // Points and XP are integers, but prices from GET /info/plans are
    // whatever the server sends, and a negative shows up in a wallet.
    expect(formatNumber(-2_500)).toBe('-2,500')
    expect(formatNumber(1_234.5)).toBe('1,234.5')
  })
})
