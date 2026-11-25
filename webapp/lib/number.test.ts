import { describe, expect, it } from 'vitest'
import { formatNumber, formatScore } from './number'

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

/**
 * The cases that matter are the ones the server actually produces: the
 * backend's calcScore divides without rounding, so a CLOZE passage of
 * three blanks with two right arrives as 6.666666666666667 and a
 * three-option MULTIPLE with one position wrong as 3.3333333333333335.
 * Printing those raw is the defect this exists to stop.
 */
describe('formatScore', () => {
  it('cuts a partial-credit score to one decimal place', () => {
    expect(formatScore((2 / 3) * 10)).toBe('6.7')
    expect(formatScore((1 / 3) * 10)).toBe('3.3')
    expect(formatScore((5 / 6) * 10)).toBe('8.3')
  })

  it('prints a whole score without a decimal part', () => {
    expect(formatScore(10)).toBe('10')
    expect(formatScore(0)).toBe('0')
    expect(formatScore(5)).toBe('5')
  })
})
