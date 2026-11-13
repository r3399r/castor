import 'zod-openapi/extend';
import { zValidator } from '@hono/zod-validator';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
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
/**
 * What this route reports.
 *
 * Schemas rather than hand-written types: each is the single
 * description of its response, the handlers' returns are checked
 * against it, and the OpenAPI document is generated from it. See "The
 * OpenAPI document" in AGENTS.md.
 *
 * Nothing secret is described here, because nothing secret is sent.
 * `params` carries the form fields ECPay itself expects, `CheckMacValue`
 * among them -- that value is a signature *over* those fields, computed
 * server-side; the HashKey and HashIV it is computed with never leave
 * the server and must never appear in a schema, a description or the
 * generated document.
 */
export const postPaymentCheckoutResponseSchema = z.object({
  action: z.string().describe("ECPay's checkout URL. POST the form here"),
  params: z
    .record(z.string())
    .describe(
      "The signed form fields, named as ECPay names them. POST every one of them verbatim: CheckMacValue signs the rest, so adding, dropping or editing a field invalidates it and ECPay rejects the order. Nothing is charged by reading this -- the cardholder has to reach ECPay's own page, and until its webhook arrives the order is only `created`"
    ),
});

/**
 * One day-pass purchase as this API reports it.
 *
 * `choosePayment` and `status` are strings, not the closed sets the
 * hand-written types declared, and this is the second place in the API
 * where that distinction bites (see `question.type`). Both columns are
 * varchars. The set really is closed in practice -- `payment_purchase`
 * is written by this backend alone, always through the exported
 * constants -- but the database does not hold it, so a `z.enum` here
 * would be a promise the handler cannot keep: `satisfies` rejected it
 * outright, which is the guard working rather than an inconvenience.
 *
 * The values are in the descriptions, so a client author knows what to
 * switch on without being told the column guarantees it.
 */
export const dayPassPurchaseSchema = z.object({
  id: z.number().int(),
  plan: z.string(),
  amount: z.number().int().describe('Frozen at checkout, so a re-priced plan never rewrites it'),
  days: z.number().int().describe('Days of access this buys'),
  choosePayment: z
    .string()
    .describe(`One of ${ONE_TIME_PAYMENT_METHODS.join(', ')}`),
  status: z
    .string()
    .describe(
      'One of created, awaiting, paid, expired, failed. `created` is a form handed to the browser with nothing reserved; `awaiting` means ECPay issued a code or virtual account and **the money has not arrived** -- where an ATM, CVS or BARCODE row spends most of its life; `paid`, `expired` and `failed` are terminal'
    ),
  paymentType: z
    .string()
    .nullable()
    .describe("ECPay's expanded value, e.g. ATM_TAISHIN. Null until paid"),
  bankCode: z.string().nullable().describe('ATM only. Null for every other method'),
  vAccount: z.string().nullable().describe('ATM only -- the virtual account to transfer to'),
  paymentNo: z.string().nullable().describe('Convenience-store code. Null for every other method'),
  barcode1: z
    .string()
    .nullable()
    .describe(
      'Store barcode, first of three segments. ECPay returns the digits only -- rendering them as a scannable Code39 barcode is the client job'
    ),
  barcode2: z.string().nullable(),
  barcode3: z.string().nullable(),
  expireAt: z
    .string()
    .nullable()
    .describe('ISO 8601. When the code stops being payable; null before one is issued'),
  paidAt: z.string().nullable().describe('ISO 8601'),
  grantedUntil: z
    .string()
    .nullable()
    .describe('ISO 8601. What the subscription was extended to; null until paid'),
  createdAt: z.string().nullable().describe('ISO 8601'),
}).openapi({ ref: 'DayPassPurchase' });

export const getPaymentPurchasesResponseSchema = z.object({
  data: z.array(dayPassPurchaseSchema),
});

/**
 * The OpenAPI entries for the two routes below.
 *
 * Hoisted out of the route definitions so the handlers keep their own
 * indentation; `describeRoute` is middleware, so where it is
 * constructed makes no difference.
 */
const checkoutDoc = describeRoute({
  summary: 'Start a payment',
  description:
    "Behind requireUser. **Charges nothing.** It answers with a signed form the browser has to POST to `action`, because the cardholder has to reach ECPay's own page to enter a card -- the amount and the callback URLs are signed server-side so they cannot be tampered with, and the submit happens client-side. Until ECPay's webhook arrives the order is only `created`, and the user may simply close the tab.\n\nA day pass requires `method`; the recurring plan refuses one, since ECPay's 定期定額 is credit-card only -- which is the reason the day passes exist at all. Changing recurring plan replaces the agreement, because ECPay cannot amend one: the old agreement is stopped by this call, so abandoning the payment page leaves the caller with no auto-renew. The UI has to say so before calling this.",
  tags: ['payment'],
  responses: {
    200: {
      description: 'The form to POST. Nothing has been charged',
      content: {
        'application/json': { schema: resolver(postPaymentCheckoutResponseSchema) },
      },
    },
    400: {
      description:
        'A day pass with no method (PAYMENT_METHOD_REQUIRED), or the recurring plan the caller is already on (ALREADY_SUBSCRIBED) -- the code in the body says which',
    },
    401: { description: 'No valid identity' },
    404: { description: 'No such plan (UNKNOWN_PLAN)' },
  },
});

const purchasesDoc = describeRoute({
  summary: "The caller's own day-pass purchases, newest first",
  description:
    'Behind requireUser, and scoped to the caller by the query rather than by an id in the path -- there is no id to guess at. It exists because an ATM or convenience-store payer has to be able to come back for the number: they leave the site to pay, possibly days later and from another device, and the virtual account was shown once on a page they have long closed. At most 20; nobody plausibly has more.',
  tags: ['payment'],
  responses: {
    200: {
      description: 'Up to 20 purchases, newest first',
      content: {
        'application/json': { schema: resolver(getPaymentPurchasesResponseSchema) },
      },
    },
    401: { description: 'No valid identity' },
  },
});

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
  .post('/checkout', checkoutDoc, zValidator('json', checkoutBodySchema), async (c) => {
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
      } satisfies z.infer<typeof postPaymentCheckoutResponseSchema>);
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
    } satisfies z.infer<typeof postPaymentCheckoutResponseSchema>);
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
  .get('/purchases', purchasesDoc, async (c) => {
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

    // Field by field rather than returning the rows: the four date
    // columns are Dates and every type in the repo calls these fields
    // strings, and a `rows` straight from the query would carry any
    // column added to payment_purchase into the response. That table
    // holds the provider's own identifiers, so that is not a shape to
    // leave to chance.
    return c.json({
      data: rows.map((row) => ({
        id: row.id,
        plan: row.plan,
        amount: row.amount,
        days: row.days,
        choosePayment: row.choosePayment,
        status: row.status,
        paymentType: row.paymentType,
        bankCode: row.bankCode,
        vAccount: row.vAccount,
        paymentNo: row.paymentNo,
        barcode1: row.barcode1,
        barcode2: row.barcode2,
        barcode3: row.barcode3,
        expireAt: row.expireAt?.toISOString() ?? null,
        paidAt: row.paidAt?.toISOString() ?? null,
        grantedUntil: row.grantedUntil?.toISOString() ?? null,
        createdAt: row.createdAt?.toISOString() ?? null,
      })),
    } satisfies z.infer<typeof getPaymentPurchasesResponseSchema>);
  });
