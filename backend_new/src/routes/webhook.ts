import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { paymentChargeTable, paymentOrderTable, paymentPurchaseTable } from 'src/db/schema';
import {
  ECPAY_ACK,
  ECPAY_PROVIDER,
  parseEcpayDate,
  parseEcpayExpireDate,
  verifyCheckMacValue,
} from 'src/lib/ecpay';
import { ORDER_STATUS_ACTIVE, ORDER_STATUS_FAILED } from 'src/lib/paymentOrder';
import {
  PURCHASE_STATUS_AWAITING,
  PURCHASE_STATUS_FAILED,
  PURCHASE_STATUS_PAID,
} from 'src/lib/paymentPurchase';
import { extendSubscriptionByDays, renewSubscriptionPeriod } from 'src/lib/subscription';
import { findDayPassPlan, findRecurringPlan } from 'src/lib/subscriptionPlan';
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
 * "Result not final yet." ECPay says explicitly not to treat this as a
 * failure and to confirm in their back office, so the purchase is left
 * open rather than marked failed -- a later notification decides it.
 */
const RTN_CODE_PENDING = 10300066;

/**
 * A code or virtual account was issued -- not a payment.
 *
 * Two values for one event, because ECPay uses a different one for ATM
 * than for the two store methods. Both are *success*: treating either as
 * an error cancels an order the consumer is about to go and pay.
 */
const RTN_CODE_ATM_ISSUED = 2;
const RTN_CODE_STORE_ISSUED = 10100073;

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
 * The first of several spellings ECPay might use for one value.
 *
 * Their own documentation for the recurring notification disagrees with
 * itself: the field list names ProcessDate and AuthCode, while the
 * schema on the same page names process_date and auth_code. Reading
 * both costs nothing and removes the question; reading one and guessing
 * wrong loses the authorisation date and code on every renewal, with
 * nothing failing to show it -- the columns are nullable and nothing
 * branches on them, so it would only surface when reconciling.
 */
const pick = (payload: Payload, ...names: string[]): string | undefined => {
  for (const name of names) {
    const value = clean(payload[name]);
    if (value !== undefined) return value;
  }
  return undefined;
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
  Number(pick(payload, 'Amount', 'amount', 'TradeAmt') ?? 0);

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

  /**
   * One ReturnURL serves both products, so the trade number is what says
   * which this is: a recurring agreement's charge, or a one-time day
   * pass. Looking in payment_order first keeps the pre-existing path
   * untouched; the generator is shared and both columns are UNIQUE, so a
   * number can only ever be in one of them.
   */
  if (order === undefined) {
    const [purchase] = await db
      .select()
      .from(paymentPurchaseTable)
      .where(eq(paymentPurchaseTable.merchantTradeNo, merchantTradeNo))
      .limit(1);
    if (purchase !== undefined) {
      await recordDayPassPayment(db, payload, source, purchase);
      return;
    }

    // A notification for something we have no record of at all. Retrying
    // will not conjure one, so it is acknowledged and logged rather than
    // left to bounce off us until ECPay gives up.
    console.error(`${source}: no payment_order or payment_purchase for ${merchantTradeNo}`);
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
    authCode: pick(payload, 'auth_code', 'AuthCode')?.slice(0, 10) ?? null,
    processDate: parseEcpayDate(
      pick(payload, 'process_date', 'ProcessDate', 'PaymentDate')
    ),
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

  // findRecurringPlan, not findPlan: a payment_order is by definition an
  // agreement, so a row naming a day pass would be corrupt rather than
  // something to renew. `annual`, retired 2026-11-10, also lands here --
  // logged and acknowledged rather than guessed at.
  const plan = findRecurringPlan(order.plan);
  if (plan === undefined) {
    console.error(
      `${source}: payment_order ${order.id} names unknown recurring plan ${order.plan}`
    );
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

type Purchase = typeof paymentPurchaseTable.$inferSelect;

/**
 * The payment result for a one-time day pass.
 *
 * Deliberately does NOT cancel a live recurring agreement, even though a
 * paid pass should stop one: that cancel is an outbound call to ECPay,
 * and this handler runs inside a callback ECPay gives ten seconds and
 * rate-limits (their notes: too-frequent calls answer HTTP 403 and need a
 * 30-minute wait). Failing it would either roll back a payment that
 * really happened, or be swallowed and leave the user charged monthly
 * forever. So this does local work only, and the daily housekeep sweep
 * performs the cancel with retries -- derived from state, not from a flag.
 */
const recordDayPassPayment = async (
  db: Db,
  payload: Payload,
  source: string,
  purchase: Purchase
): Promise<void> => {
  const rtnCode = Number(payload.RtnCode);
  const now = new Date();

  // Already granted. ECPay retries anything it did not get `1|OK` for, up
  // to four times a day, so this is the normal case rather than an
  // anomaly -- and without it a retry would grant the days twice.
  if (purchase.status === PURCHASE_STATUS_PAID) {
    console.log(`${source}: purchase ${purchase.id} already paid, acknowledging again`);
    return;
  }

  if (rtnCode === RTN_CODE_PENDING) {
    console.log(`${source}: purchase ${purchase.id} result still pending, leaving open`);
    return;
  }

  // ECPay's back office can replay a notification as a test. It looks
  // exactly like a real one, but no money moved, so it must not buy
  // anything.
  const simulatePaid = clean(payload.SimulatePaid) === '1';
  if (rtnCode === RTN_CODE_SUCCESS && simulatePaid) {
    console.log(`${source}: purchase ${purchase.id} simulated, granting nothing`);
    return;
  }

  if (rtnCode !== RTN_CODE_SUCCESS) {
    console.error(`${source}: purchase ${purchase.id} failed rtnCode=${rtnCode}`);
    await db
      .update(paymentPurchaseTable)
      .set({ status: PURCHASE_STATUS_FAILED, updatedAt: now })
      .where(eq(paymentPurchaseTable.id, purchase.id));
    return;
  }

  // The days and the price were frozen on the purchase row, but the plan
  // is still looked up: `days` is what to grant, and the catalog entry is
  // what user_subscription.plan has to name.
  const plan = findDayPassPlan(purchase.plan);
  if (plan === undefined) {
    console.error(`${source}: purchase ${purchase.id} names unknown day pass ${purchase.plan}`);
    return;
  }

  const period = await extendSubscriptionByDays(
    db,
    purchase.userId,
    // The stored days win over the catalog's, so re-pricing a plan never
    // changes what an already-paid purchase bought.
    { ...plan, days: purchase.days },
    ECPAY_PROVIDER,
    purchase.merchantTradeNo
  );

  await db
    .update(paymentPurchaseTable)
    .set({
      status: PURCHASE_STATUS_PAID,
      paymentType: clean(payload.PaymentType) ?? null,
      ecpayTradeNo: clean(payload.TradeNo) ?? null,
      paidAt: parseEcpayDate(clean(payload.PaymentDate)) ?? now,
      grantedUntil: period.currentPeriodEnd,
      updatedAt: now,
    })
    .where(eq(paymentPurchaseTable.id, purchase.id));

  console.log(
    `${source}: granted userId=${purchase.userId} plan=${purchase.plan} ` +
      `days=${purchase.days} until=${period.currentPeriodEnd.toISOString()}`
  );
};

/**
 * The code or virtual account ECPay just issued for an unpaid purchase.
 *
 * This is not a payment and must never grant anything. It exists because
 * the consumer cannot pay without it: ECPay posts the virtual account or
 * store code here, and a merchant that does not implement this endpoint
 * leaves the payer with nothing to take to the ATM.
 */
const recordPaymentInfo = async (db: Db, payload: Payload, source: string): Promise<void> => {
  const merchantTradeNo = payload.MerchantTradeNo ?? '';
  const rtnCode = Number(payload.RtnCode);
  console.log(
    `${source} merchantTradeNo=${merchantTradeNo} rtnCode=${rtnCode} rtnMsg=${payload.RtnMsg}`
  );

  const [purchase] = await db
    .select()
    .from(paymentPurchaseTable)
    .where(eq(paymentPurchaseTable.merchantTradeNo, merchantTradeNo))
    .limit(1);
  if (purchase === undefined) {
    console.error(`${source}: no payment_purchase for merchantTradeNo=${merchantTradeNo}`);
    return;
  }

  // The payment notification can overtake this one if ECPay retries, and
  // an already-paid purchase must not be pushed back to awaiting.
  if (purchase.status === PURCHASE_STATUS_PAID) {
    console.log(`${source}: purchase ${purchase.id} already paid, ignoring code issue`);
    return;
  }

  const issued = rtnCode === RTN_CODE_ATM_ISSUED || rtnCode === RTN_CODE_STORE_ISSUED;
  if (!issued) {
    console.error(`${source}: purchase ${purchase.id} code issue failed rtnCode=${rtnCode}`);
    await db
      .update(paymentPurchaseTable)
      .set({ status: PURCHASE_STATUS_FAILED, updatedAt: new Date() })
      .where(eq(paymentPurchaseTable.id, purchase.id));
    return;
  }

  await db
    .update(paymentPurchaseTable)
    .set({
      status: PURCHASE_STATUS_AWAITING,
      paymentType: clean(payload.PaymentType) ?? null,
      ecpayTradeNo: clean(payload.TradeNo) ?? null,
      bankCode: clean(payload.BankCode) ?? null,
      vAccount: clean(payload.vAccount) ?? null,
      paymentNo: clean(payload.PaymentNo) ?? null,
      barcode1: clean(payload.Barcode1) ?? null,
      barcode2: clean(payload.Barcode2) ?? null,
      barcode3: clean(payload.Barcode3) ?? null,
      // Two formats behind one field name -- see parseEcpayExpireDate.
      expireAt: parseEcpayExpireDate(clean(payload.ExpireDate)),
      updatedAt: new Date(),
    })
    .where(eq(paymentPurchaseTable.id, purchase.id));

  console.log(`${source}: purchase ${purchase.id} awaiting payment`);
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
  })
  /**
   * The code or virtual account for an unpaid day pass (ECPay's
   * PaymentInfoURL). Not a payment -- the money arrives later, through
   * /ecpay/notify, possibly a week later.
   */
  .post('/ecpay/payment-info', async (c) => {
    const payload = verified(parseFormBody(await c.req.text()));
    await recordPaymentInfo(c.get('db'), payload, 'POST /api/webhook/ecpay/payment-info');

    return c.text(ECPAY_ACK);
  });
