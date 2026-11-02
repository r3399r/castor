import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { paymentOrderTable } from 'src/db/schema';
import { cancelPeriodOrder } from 'src/lib/ecpay';
import { ORDER_STATUS_ACTIVE, ORDER_STATUS_CANCELLED } from 'src/lib/paymentOrder';
import {
  findActiveSubscription,
  listSubscriptionHistory,
  setSubscription,
} from 'src/lib/subscription';
import { UserEnv } from 'src/middleware/requireUser';

/**
 * The signed-in caller's own subscription.
 *
 * The read routes sit behind requireUser but deliberately NOT behind
 * requireSubscription: these are the endpoints a non-subscriber is
 * expected to call. Gating them would mean the only way to discover you
 * are not subscribed is to be refused, which is the wrong shape for a
 * page that has to render an upgrade prompt.
 */
export const subscription = new Hono<UserEnv>()
  /**
   * Current status. Returns 200 with active:false rather than a 403 --
   * "you are not subscribed" is the successful answer to this question.
   */
  .get('/me', async (c) => {
    const user = c.get('user');
    console.log(`GET /api/subscription/me userId=${user.id}`);

    const active = await findActiveSubscription(c.get('db'), user.id);

    return c.json({
      active: active !== undefined,
      plan: active?.plan ?? null,
      expiresAt: active?.currentPeriodEnd ?? null,
    });
  })
  /**
   * Every period the user has had, newest first -- renewals, lapses and
   * cancellations included, since each is its own row.
   */
  .get('/history', async (c) => {
    const user = c.get('user');
    console.log(`GET /api/subscription/history userId=${user.id}`);

    return c.json(await listSubscriptionHistory(c.get('db'), user.id));
  })
  /**
   * Turns auto-renew off. Entitlement is not revoked: the period the
   * user has already paid for runs to its end, which is what
   * findEntitledSubscription means by accepting a cancelled row.
   *
   * ECPay is told first and the database second, inside the request
   * transaction, so a refusal from them rolls our side back. The other
   * order would leave us believing auto-renew is off while their
   * scheduler keeps charging the card -- the one failure here that
   * costs the user money.
   *
   * One-way, because ECPay's cancellation is: resubscribing means a new
   * agreement, and its first charge is immediate.
   */
  .post('/cancel', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    console.log(`POST /api/subscription/cancel userId=${user.id}`);

    const [order] = await db
      .select({
        id: paymentOrderTable.id,
        merchantTradeNo: paymentOrderTable.merchantTradeNo,
      })
      .from(paymentOrderTable)
      .where(
        and(eq(paymentOrderTable.userId, user.id), eq(paymentOrderTable.status, ORDER_STATUS_ACTIVE))
      )
      .limit(1);

    // No agreement to stop is not an error: a subscription granted by
    // hand has no payment order behind it, and the caller's intent --
    // "stop renewing me" -- is already true.
    if (order !== undefined) {
      await cancelPeriodOrder(order.merchantTradeNo);
      await db
        .update(paymentOrderTable)
        .set({ status: ORDER_STATUS_CANCELLED, cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(paymentOrderTable.id, order.id));
    }

    await setSubscription(db, user.id, false);

    // Reports active:false the moment auto-renew is off, matching
    // GET /me. Remaining entitlement is visible in /history, which is
    // where the client derives "cancelled but still usable" from.
    const active = await findActiveSubscription(db, user.id);

    return c.json({
      active: active !== undefined,
      plan: active?.plan ?? null,
      expiresAt: active?.currentPeriodEnd ?? null,
    });
  });
