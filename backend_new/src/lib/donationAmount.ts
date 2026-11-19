/**
 * What the platform gives per maxed spirit, in NT dollars.
 *
 * NT$100, decided 2026-11-20. It replaces a provisional NT$1,000, which
 * had been derived when the per-spirit total was 1,000,000 and was left
 * 9.5x over when that total came down to 100,000 on 2026-11-10. POINTS.md
 * carries the arithmetic: about NT$1.05 per 1,000 points at a third of
 * monthly-plan revenue, so 100,000 points supports roughly NT$105.
 *
 * It is copied into donation.amount at confirmation and never read back
 * from here for display, so changing it only affects donations confirmed
 * afterwards. Reading it at render time instead would rewrite history
 * every time the number moved.
 *
 * It lives here rather than in routes/donation.ts because the public
 * record under /api/info/donation needs it too -- to price the spirits
 * that have maxed but whose owners have not chosen an organisation yet,
 * which are the only donations not yet frozen to a number of their own.
 * A route importing another route for one constant is how a second copy
 * of it eventually appears.
 */
export const DONATION_AMOUNT = 100;
