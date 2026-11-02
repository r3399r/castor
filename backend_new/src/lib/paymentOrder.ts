/**
 * The lifecycle of a recurring-payment agreement.
 *
 * Here rather than in a route file because three routes read it --
 * checkout, both webhooks and cancel -- and a route importing another
 * route to borrow a constant hides which of them owns the meaning.
 *
 * Only `created` and `cancelled` are ours to set directly. `active` and
 * `failed` are decided by what the provider tells us, and `terminated`
 * is the provider giving up on its own (executions exhausted, card
 * expired, or six consecutive failures) -- we only ever learn about it
 * from a notification that stops arriving, which is why nothing in the
 * code writes it today. See db/table/payment_order.sql.
 */
export const ORDER_STATUS_CREATED = 'created';
export const ORDER_STATUS_ACTIVE = 'active';
export const ORDER_STATUS_CANCELLED = 'cancelled';
export const ORDER_STATUS_FAILED = 'failed';
