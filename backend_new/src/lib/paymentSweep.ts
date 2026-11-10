import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { paymentOrderTable, paymentPurchaseTable } from 'src/db/schema';
import { cancelPeriodOrder } from 'src/lib/ecpay';
import { ORDER_STATUS_ACTIVE, ORDER_STATUS_CANCELLED } from 'src/lib/paymentOrder';
import {
  PURCHASE_STATUS_AWAITING,
  PURCHASE_STATUS_EXPIRED,
  PURCHASE_STATUS_PAID,
} from 'src/lib/paymentPurchase';

type Db = MySql2Database;

/**
 * Closes day-pass purchases whose payment code has run out.
 *
 * Cosmetic rather than load-bearing: an unpaid purchase grants nothing
 * whatever its status says, so nothing depends on this running. It exists
 * so the user's own screen can say "過期" instead of leaving a virtual
 * account on display that no longer works, and so the sweep below has a
 * smaller set to scan.
 *
 * Only rows that actually reached `awaiting` have an expiry to pass --
 * `created` ones were never issued a code, and ECPay may still be about
 * to issue one.
 */
export const expireUnpaidPurchases = async (db: Db): Promise<number> => {
  const now = new Date();
  const [{ affectedRows }] = await db
    .update(paymentPurchaseTable)
    .set({ status: PURCHASE_STATUS_EXPIRED, updatedAt: now })
    .where(
      and(
        eq(paymentPurchaseTable.status, PURCHASE_STATUS_AWAITING),
        isNotNull(paymentPurchaseTable.expireAt),
        lt(paymentPurchaseTable.expireAt, now)
      )
    );

  if (affectedRows > 0) console.log(`expired ${affectedRows} unpaid day-pass purchases`);
  return affectedRows;
};

/**
 * Stops a recurring agreement once the same user has paid for a day pass.
 *
 * Why here and not in the webhook that recorded the payment: cancelling
 * is an outbound call to ECPay, and that webhook is a callback ECPay
 * allows ten seconds and rate-limits -- their notes say too-frequent
 * calls answer HTTP 403 and need a 30-minute wait. Inside the callback a
 * failure has only bad options: throw, and a payment that really happened
 * rolls back; swallow, and the user keeps being charged monthly with
 * nothing recording that they should not be. Out here it can simply be
 * retried tomorrow.
 *
 * Why there is no "cancel requested" column: the work is derivable from
 * state the payment already wrote -- a paid purchase next to an active
 * order. That also makes it self-clearing, because cancelling the order
 * is what stops it matching.
 *
 * The delay costs at most one extra charge, and only if a monthly
 * authorisation happens to fall inside the same day. That charge is not
 * lost either -- it extends the subscription further.
 */
export const cancelOrdersSupersededByDayPass = async (db: Db): Promise<number> => {
  const paidUsers = await db
    .selectDistinct({ userId: paymentPurchaseTable.userId })
    .from(paymentPurchaseTable)
    .where(eq(paymentPurchaseTable.status, PURCHASE_STATUS_PAID));
  if (paidUsers.length === 0) return 0;

  const orders = await db
    .select({
      id: paymentOrderTable.id,
      userId: paymentOrderTable.userId,
      merchantTradeNo: paymentOrderTable.merchantTradeNo,
    })
    .from(paymentOrderTable)
    .where(
      and(
        eq(paymentOrderTable.status, ORDER_STATUS_ACTIVE),
        inArray(
          paymentOrderTable.userId,
          paidUsers.map((row) => row.userId)
        )
      )
    );

  let cancelled = 0;
  for (const order of orders) {
    try {
      await cancelPeriodOrder(order.merchantTradeNo);
    } catch (error) {
      // Left active on purpose, so tomorrow's run tries again. Marking it
      // cancelled locally after a failed cancel would be the worst
      // outcome available: ECPay would keep charging and nothing here
      // would ever look at it again.
      console.error(
        `failed to cancel superseded order ${order.id} (${order.merchantTradeNo})`,
        error
      );
      continue;
    }

    await db
      .update(paymentOrderTable)
      .set({ status: ORDER_STATUS_CANCELLED, cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(paymentOrderTable.id, order.id));
    cancelled += 1;
    console.log(
      `cancelled recurring order ${order.id} for userId=${order.userId}: superseded by a day pass`
    );
  }

  // Entitlement is deliberately untouched. The user keeps every day they
  // paid for -- the agreement stopping is not the period ending.
  return cancelled;
};
