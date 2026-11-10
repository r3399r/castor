import { zValidator } from '@hono/zod-validator';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { paymentOrderTable, paymentPurchaseTable } from 'src/db/schema';
import {
  ECPAY_PROVIDER,
  ONE_TIME_PAYMENT_METHODS,
  buildOneTimeCheckoutParams,
  buildPeriodCheckoutParams,
  cancelPeriodOrder,
  checkoutUrl,
  generateMerchantTradeNo,
} from 'src/lib/ecpay';
import {
  ORDER_STATUS_CANCELLED,
  ORDER_STATUS_CREATED,
  findActiveOrder,
} from 'src/lib/paymentOrder';
import { setSubscription } from 'src/lib/subscription';
import { findPlan, isDayPassPlan } from 'src/lib/subscriptionPlan';
import {
  PURCHASE_STATUS_CREATED,
} from 'src/lib/paymentPurchase';
import { BadRequestError, NotFoundError } from 'src/model/error';
import { UserEnv } from 'src/middleware/requireUser';

export const checkoutBodySchema = z.object({
  plan: z.string().min(1),
  /**
   * Required for a day pass, meaningless for the recurring plan (which is
   * credit-card only, by ECPay's product). Validated against the plan
   * below rather than by the schema, so the error says which of the two
   * is wrong.
   */
  method: z.enum(ONE_TIME_PAYMENT_METHODS).optional(),
});

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

    /**
     * A day pass buys days once. It creates no agreement, so none of the
     * payment_order handling below applies -- and in particular it must
     * not cancel a live recurring agreement here. ECPay's cancel is
     * one-way, while an ATM or store payment can go unpaid for a week:
     * cancelling now would leave someone who never pays with no
     * subscription and no pass. The cancel happens once the money
     * actually arrives, swept by housekeep rather than done inside the
     * callback.
     */
    if (isDayPassPlan(plan)) {
      const { method } = c.req.valid('json');
      if (method === undefined)
        throw new BadRequestError('a payment method is required', 'PAYMENT_METHOD_REQUIRED');

      const now = new Date();
      const merchantTradeNo = generateMerchantTradeNo();
      await db.insert(paymentPurchaseTable).values({
        userId: user.id,
        plan: plan.code,
        provider: ECPAY_PROVIDER,
        merchantTradeNo,
        // Frozen here, never re-read from the catalog: this is what was
        // sold at this moment.
        amount: plan.amount,
        days: plan.days,
        choosePayment: method,
        status: PURCHASE_STATUS_CREATED,
        createdAt: now,
        updatedAt: now,
      });

      return c.json({
        action: checkoutUrl(),
        params: buildOneTimeCheckoutParams({
          merchantTradeNo,
          tradeDate: now,
          itemName: plan.itemName,
          tradeDesc: plan.tradeDesc,
          amount: plan.amount,
          method,
        }),
      });
    }

    const live = await findActiveOrder(db, user.id);

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
  })
  /**
   * The caller's own day-pass purchases, newest first.
   *
   * Exists because an ATM or convenience-store payer has to be able to
   * come back for the number. They leave our site to pay, possibly days
   * later, from a different device, and the virtual account was shown to
   * them once on a page they have long closed. Without this the only copy
   * is in an email ECPay may or may not have sent.
   *
   * Scoped to the signed-in user by the query, not by an id in the path,
   * so there is no id to guess at and nothing to get wrong.
   */
  .get('/purchases', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    console.log(`GET /api/payment/purchases userId=${user.id}`);

    const rows = await db
      .select({
        id: paymentPurchaseTable.id,
        plan: paymentPurchaseTable.plan,
        amount: paymentPurchaseTable.amount,
        days: paymentPurchaseTable.days,
        choosePayment: paymentPurchaseTable.choosePayment,
        status: paymentPurchaseTable.status,
        paymentType: paymentPurchaseTable.paymentType,
        bankCode: paymentPurchaseTable.bankCode,
        vAccount: paymentPurchaseTable.vAccount,
        paymentNo: paymentPurchaseTable.paymentNo,
        barcode1: paymentPurchaseTable.barcode1,
        barcode2: paymentPurchaseTable.barcode2,
        barcode3: paymentPurchaseTable.barcode3,
        expireAt: paymentPurchaseTable.expireAt,
        paidAt: paymentPurchaseTable.paidAt,
        grantedUntil: paymentPurchaseTable.grantedUntil,
        createdAt: paymentPurchaseTable.createdAt,
      })
      .from(paymentPurchaseTable)
      .where(eq(paymentPurchaseTable.userId, user.id))
      // id as the tiebreaker: two purchases in the same millisecond are
      // possible, and the newest is the one the payer is looking for.
      .orderBy(desc(paymentPurchaseTable.createdAt), desc(paymentPurchaseTable.id))
      // A person cannot plausibly have more than a handful, and the
      // screen shows the open one plus a short history.
      .limit(20);

    return c.json({ data: rows });
  });
