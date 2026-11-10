import { and, eq } from 'drizzle-orm';
import { paymentOrderTable } from 'src/db/schema';
import { TransactionEnv } from 'src/middleware/transaction';

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

type Db = TransactionEnv['Variables']['db'];

export type ActiveOrder = {
  id: number;
  plan: string;
  merchantTradeNo: string;
};

/**
 * The caller's live recurring agreement, or undefined when they have none.
 *
 * One definition for every caller, because three of them act on it and
 * they must not disagree: checkout replaces it, cancel stops it, and
 * GET /subscription/me reports it as `autoRenew` so the UI knows whether
 * there is anything to cancel.
 *
 * That last one is why this is "is there an agreement" and not "does the
 * user have access". A day pass grants access with no agreement behind
 * it, so entitlement cannot answer the question the cancel button asks,
 * and inferring one from the other told day-pass buyers their one-off
 * purchase would be charged again every month.
 *
 * At most one active row per user is a convention the routes maintain
 * rather than a database constraint, hence the limit -- see
 * db/table/payment_order.sql.
 */
export const findActiveOrder = async (
  db: Db,
  userId: number
): Promise<ActiveOrder | undefined> => {
  const [order] = await db
    .select({
      id: paymentOrderTable.id,
      plan: paymentOrderTable.plan,
      merchantTradeNo: paymentOrderTable.merchantTradeNo,
    })
    .from(paymentOrderTable)
    .where(and(eq(paymentOrderTable.userId, userId), eq(paymentOrderTable.status, ORDER_STATUS_ACTIVE)))
    .limit(1);

  return order;
};
