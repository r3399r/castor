/**
 * What the platform gives per maxed spirit, in NT dollars.
 *
 * Provisional -- the real figure is undecided. It is copied into
 * donation.amount at confirmation and never read back from here for
 * display, so changing it only affects donations confirmed afterwards.
 * Reading it at render time instead would rewrite history every time the
 * number moved.
 *
 * It lives here rather than in routes/donation.ts because the public
 * record under /api/info/donation needs it too -- to price the spirits
 * that have maxed but whose owners have not chosen an organisation yet,
 * which are the only donations not yet frozen to a number of their own.
 * A route importing another route for one constant is how a second copy
 * of it eventually appears.
 */
export const DONATION_AMOUNT = 1000;
