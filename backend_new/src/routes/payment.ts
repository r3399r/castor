import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { paymentOrderTable } from 'src/db/schema';
import {
  ECPAY_PROVIDER,
  buildPeriodCheckoutParams,
  cancelPeriodOrder,
  checkoutUrl,
  generateMerchantTradeNo,
} from 'src/lib/ecpay';
import {
  ORDER_STATUS_ACTIVE,
  ORDER_STATUS_CANCELLED,
  ORDER_STATUS_CREATED,
} from 'src/lib/paymentOrder';
import { setSubscription } from 'src/lib/subscription';
import { findPlan } from 'src/lib/subscriptionPlan';
import { BadRequestError, NotFoundError } from 'src/model/error';
import { UserEnv } from 'src/middleware/requireUser';

export const checkoutBodySchema = z.object({ plan: z.string().min(1) });

/**
 * Starting and replacing a recurring payment agreement.
 *
 * Behind requireUser, unlike the webhook routes under /api/webhook --
 * this one is a signed-in person asking to be charged, that one is
 * ECPay's server reporting a charge.
 */
export const payment = new Hono<UserEnv>()
  /**
   * Hands the browser a signed ECPay form to POST.
   *
   * The redirect cannot start here: the cardholder has to reach ECPay's
   * own page to type their card in, so the form is built server-side
   * (where the amount and the callback URLs are signed and so cannot be
   * tampered with) and submitted client-side.
   *
   * Nothing is charged by this call. Until ECPay's webhook arrives the
   * order is only `created`, and the user may simply close the tab.
   */
  .post('/checkout', zValidator('json', checkoutBodySchema), async (c) => {
    const { plan: planCode } = c.req.valid('json');
    const user = c.get('user');
    const db = c.get('db');
    console.log(`POST /api/payment/checkout userId=${user.id} plan=${planCode}`);

    const plan = findPlan(planCode);
    if (plan === undefined) throw new NotFoundError(`unknown plan ${planCode}`, 'UNKNOWN_PLAN');

    const [live] = await db
      .select({
        id: paymentOrderTable.id,
        plan: paymentOrderTable.plan,
        merchantTradeNo: paymentOrderTable.merchantTradeNo,
      })
      .from(paymentOrderTable)
      .where(
        and(
          eq(paymentOrderTable.userId, user.id),
          eq(paymentOrderTable.status, ORDER_STATUS_ACTIVE)
        )
      )
      .limit(1);

    // Re-buying the plan they are already on would just charge them
    // again for the same thing. Refused with a distinct code so the UI
    // can say so rather than showing a generic failure.
    if (live !== undefined && live.plan === plan.code)
      throw new BadRequestError('already subscribed to this plan', 'ALREADY_SUBSCRIBED');

    const now = new Date();
    const merchantTradeNo = generateMerchantTradeNo();
    await db.insert(paymentOrderTable).values({
      userId: user.id,
      plan: plan.code,
      provider: ECPAY_PROVIDER,
      merchantTradeNo,
      status: ORDER_STATUS_CREATED,
      periodType: plan.periodType,
      frequency: plan.frequency,
      execTimes: plan.execTimes,
      periodAmount: plan.amount,
      createdAt: now,
      updatedAt: now,
    });

    // Changing plan means replacing the agreement, because ECPay cannot
    // amend one. The old agreement is stopped now rather than when the
    // new one's first charge lands: leaving both live risks the old one
    // charging in between, and ECPay offers no way to make the two
    // atomic. The consequence -- abandoning the payment page leaves the
    // user with no auto-renew -- is the user's to accept, so the UI
    // says it before this is called.
    //
    // Done after the insert so that a refusal from ECPay rolls the whole
    // request back and leaves nothing half-changed.
    if (live !== undefined) {
      await cancelPeriodOrder(live.merchantTradeNo);
      await db
        .update(paymentOrderTable)
        .set({ status: ORDER_STATUS_CANCELLED, cancelledAt: now, updatedAt: now })
        .where(eq(paymentOrderTable.id, live.id));
      // Auto-renew really is off until the new agreement pays, and the
      // status screens should say so. Entitlement is untouched: this
      // marks the period cancelled, and a cancelled period still grants
      // access until it ends.
      await setSubscription(db, user.id, false);
    }

    return c.json({
      action: checkoutUrl(),
      params: buildPeriodCheckoutParams({
        merchantTradeNo,
        tradeDate: now,
        itemName: plan.itemName,
        tradeDesc: plan.tradeDesc,
        amount: plan.amount,
        periodType: plan.periodType,
        frequency: plan.frequency,
        execTimes: plan.execTimes,
      }),
    });
  });
