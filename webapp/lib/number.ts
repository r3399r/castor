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

/**
 * A 0-10 answer score, as a user should read it.
 *
 * The server sends it unrounded on purpose (see the `score` field on the
 * /reply responses): MULTIPLE deducts per wrong position and CLOZE credits
 * per correct blank, so three blanks with two right is literally
 * 6.666666666666667, and every screen that printed `{score}` printed all
 * of it. Rounded here rather than at the source because the raw value also
 * feeds user_concept_stat and question.scoring_total, where the precision
 * is load-bearing -- this is a display concern only.
 *
 * One decimal place, and a trailing `.0` is dropped: a full-mark answer
 * reads `10`, not `10.0`. No thousands separator, unlike formatNumber --
 * the range is 0-10.
 */
export const formatScore = (score: number): string => String(Math.round(score * 10) / 10)
