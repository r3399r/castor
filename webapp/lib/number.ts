/**
 * Thousands separators for a number shown to a user.
 *
 * A helper rather than calling toLocaleString at each site, for two
 * reasons. The locale is pinned: a bare `toLocaleString()` follows
 * whatever locale the browser reports, so the same build can render
 * `1,250` for one user and `1.250` for another. And the rule lives in one
 * place, which is what makes it changeable -- the alternative is finding
 * every call site again.
 *
 * Only for numbers that are read as quantities. Not for a form field's
 * value (`<input type="number">` rejects the separator), an id, a year, or
 * an index like `第 3 題`.
 */
export const formatNumber = (value: number): string => value.toLocaleString('zh-TW')
