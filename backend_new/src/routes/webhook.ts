import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { paymentChargeTable, paymentOrderTable } from 'src/db/schema';
import { ECPAY_ACK, ECPAY_PROVIDER, parseEcpayDate, verifyCheckMacValue } from 'src/lib/ecpay';
import { ORDER_STATUS_ACTIVE, ORDER_STATUS_FAILED } from 'src/lib/paymentOrder';
import { renewSubscriptionPeriod } from 'src/lib/subscription';
import { findPlan } from 'src/lib/subscriptionPlan';
import { BadRequestError } from 'src/model/error';
import { TransactionEnv } from 'src/middleware/transaction';

/**
 * Payment-provider callbacks.
 *
 * Mounted under its own prefix precisely because nothing here is behind
 * requireUser: the caller is ECPay's server, which has no Firebase token
 * and never will. Making "no authentication" a property of the prefix,
 * rather than an exception carved out of /api/payment, means a route
 * added here later cannot quietly inherit the wrong thing -- whoever
 * adds one has to notice where they are putting it.
 *
 * Authenticity comes from CheckMacValue, which requires the HashKey.
 */

type Db = TransactionEnv['Variables']['db'];
type Payload = Record<string, string>;

/** ECPay reports a declined authorisation as anything other than 1. */
const RTN_CODE_SUCCESS = 1;

/**
 * The body as ECPay actually sends it, parsed without relying on
 * Content-Type surviving the trip.
 *
 * CloudFront's /api/* behaviour forwards only Authorization and Accept
 * (aws/cloudformation/template.yaml), so the
 * `application/x-www-form-urlencoded` header a form POST carries may
 * never reach the Lambda -- and `c.req.parseBody()` decides what to do
 * from exactly that header. Reading the raw text and parsing it here
 * makes the question moot.
 */
const parseFormBody = (text: string): Payload =>
  Object.fromEntries(new URLSearchParams(text).entries());

/** Trims, and treats ECPay's empty-ish values as absent. */
const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' || trimmed === '0' ? undefined : trimmed;
};

/**
 * The value that makes processing a notification idempotent.
 *
 * ECPay retries anything it did not get `1|OK` for, so without this a
 * retry would hand out a second subscription period. `gwsr` is the
 * authorisation number the recurring notification carries; the first
 * notification is an ordinary checkout result and may arrive without
 * one, so it falls back to ECPay's trade number. The `T` prefix keeps
 * the two value spaces from ever colliding.
 *
 * undefined only for a declined authorisation, which has no number of
 * either kind -- and which grants nothing, so needs no deduplication.
 */
const dedupeKey = (payload: Payload): string | undefined => {
  const gwsr = clean(payload.gwsr);
  if (gwsr !== undefined) return gwsr;
  const tradeNo = clean(payload.TradeNo);
  return tradeNo === undefined ? undefined : `T${tradeNo}`;
};

// The recurring notification calls it Amount, the first one TradeAmt.
const amountOf = (payload: Payload): number =>
  Number(clean(payload.Amount) ?? clean(payload.TradeAmt) ?? 0);

/**
 * Records one authorisation and, when it paid, extends the subscription.
 *
 * Every path that is not a thrown error ends in the same `1|OK`: that
 * string is what stops ECPay retrying, and "we already handled this" is
 * as good a reason to stop as "we handled it just now". Anything that
 * *should* be retried -- a database failure -- throws instead, rolls the
 * transaction back and answers 500, which ECPay treats as undelivered.
 */
const recordNotification = async (db: Db, payload: Payload, source: string): Promise<void> => {
  const merchantTradeNo = payload.MerchantTradeNo ?? '';
  const rtnCode = Number(payload.RtnCode);
  console.log(
    `${source} merchantTradeNo=${merchantTradeNo} rtnCode=${rtnCode} rtnMsg=${payload.RtnMsg}`
  );

  const [order] = await db
    .select()
    .from(paymentOrderTable)
    .where(eq(paymentOrderTable.merchantTradeNo, merchantTradeNo))
    .limit(1);

  // A notification for an order we have no record of. Retrying will not
  // conjure one, so it is acknowledged and logged rather than left to
  // bounce off us until ECPay gives up.
  if (order === undefined) {
    console.error(`${source}: no payment_order for merchantTradeNo=${merchantTradeNo}`);
    return;
  }

  const key = dedupeKey(payload);
  if (key !== undefined) {
    const [seen] = await db
      .select({ id: paymentChargeTable.id })
      .from(paymentChargeTable)
      .where(eq(paymentChargeTable.gwsr, key))
      .limit(1);
    if (seen !== undefined) {
      console.log(`${source}: already processed key=${key}, acknowledging again`);
      return;
    }
  }

  // ECPay's back office can replay a notification as a test. It looks
  // exactly like a real one, but no money moved, so it must not buy
  // anything.
  const simulatePaid = clean(payload.SimulatePaid) === '1';
  const paid = rtnCode === RTN_CODE_SUCCESS && !simulatePaid;
  const now = new Date();

  await db.insert(paymentChargeTable).values({
    paymentOrderId: order.id,
    gwsr: key ?? null,
    rtnCode,
    rtnMsg: payload.RtnMsg?.slice(0, 255) ?? null,
    amount: amountOf(payload),
    authCode: clean(payload.auth_code)?.slice(0, 10) ?? null,
    processDate: parseEcpayDate(payload.process_date ?? payload.PaymentDate),
    totalSuccessTimes: clean(payload.TotalSuccessTimes)
      ? Number(payload.TotalSuccessTimes)
      : null,
    simulatePaid,
    createdAt: now,
  });

  if (!paid) {
    // A declined *first* authorisation means ECPay never scheduled
    // anything, so the agreement is dead on arrival. A declined renewal
    // is different: ECPay retries and gives up only after six
    // consecutive failures, so the agreement stays active and the
    // subscription lapses by itself at the end of the period already
    // paid for. Nothing here revokes access early -- the user has paid
    // for the days they are in.
    if (order.status !== ORDER_STATUS_ACTIVE)
      await db
        .update(paymentOrderTable)
        .set({ status: ORDER_STATUS_FAILED, updatedAt: now })
        .where(eq(paymentOrderTable.id, order.id));
    return;
  }

  if (key === undefined) {
    // A successful charge we cannot deduplicate would be granted again
    // on every retry. Refusing to grant is the recoverable direction:
    // it is visible to the user and fixable by hand, whereas a silent
    // double grant is neither.
    console.error(`${source}: paid notification with no gwsr or TradeNo, refusing to grant`);
    return;
  }

  const plan = findPlan(order.plan);
  if (plan === undefined) {
    console.error(`${source}: payment_order ${order.id} names unknown plan ${order.plan}`);
    return;
  }

  if (order.status !== ORDER_STATUS_ACTIVE)
    await db
      .update(paymentOrderTable)
      .set({
        status: ORDER_STATUS_ACTIVE,
        ecpayTradeNo: clean(payload.TradeNo) ?? null,
        updatedAt: now,
      })
      .where(eq(paymentOrderTable.id, order.id));

  const period = await renewSubscriptionPeriod(
    db,
    order.userId,
    plan,
    ECPAY_PROVIDER,
    order.merchantTradeNo
  );
  console.log(
    `${source}: granted userId=${order.userId} plan=${plan.code} ` +
      `until=${period.currentPeriodEnd.toISOString()}`
  );
};

/**
 * A rejected CheckMacValue answers 400 rather than `1|OK`.
 *
 * A forged request gains nothing either way, but a mistake in our own
 * signing would make every real notification fail this check -- and a
 * 400 makes ECPay retry and the failure visible, where acknowledging it
 * would lose paid subscriptions silently.
 */
const verified = (payload: Payload): Payload => {
  if (!verifyCheckMacValue(payload))
    throw new BadRequestError('invalid CheckMacValue', 'ECPAY_BAD_MAC');
  return payload;
};

export const webhook = new Hono<TransactionEnv>()
  /** First authorisation of a recurring agreement (ECPay's ReturnURL). */
  .post('/ecpay/notify', async (c) => {
    const payload = verified(parseFormBody(await c.req.text()));
    await recordNotification(c.get('db'), payload, 'POST /api/webhook/ecpay/notify');

    return c.text(ECPAY_ACK);
  })
  /** Every scheduled charge after the first (ECPay's PeriodReturnURL). */
  .post('/ecpay/period', async (c) => {
    const payload = verified(parseFormBody(await c.req.text()));
    await recordNotification(c.get('db'), payload, 'POST /api/webhook/ecpay/period');

    return c.text(ECPAY_ACK);
  });
