import 'zod-openapi/extend';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { paymentOrderTable } from 'src/db/schema';
import { cancelPeriodOrder } from 'src/lib/ecpay';
import { ORDER_STATUS_CANCELLED, findActiveOrder } from 'src/lib/paymentOrder';
import {
  findActiveSubscription,
  findEntitledSubscription,
  listSubscriptionHistory,
  setSubscription,
} from 'src/lib/subscription';
import { UserEnv } from 'src/middleware/requireUser';

/**
 * Access, billing and renewal as three separate answers.
 *
 * Exported because four responses report this same shape -- GET /me,
 * POST /cancel, POST /user/sync and the admin PUT -- and one of them
 * reporting it differently is exactly the drift this is meant to stop.
 * It lives here because this route owns the resource.
 *
 * The `.describe()` text is not decoration: the three booleans are the
 * field most often read wrongly in this codebase, and the document is
 * where a client author will look.
 */
export const subscriptionStatusSchema = z.object({
  active: z
    .boolean()
    .describe('Whether an agreement period is in status `active`. A billing fact, not an access one.'),
  plan: z.string().nullable(),
  expiresAt: z
    .string()
    .nullable()
    .describe('ISO 8601 end of the active period, or null when there is none'),
  entitled: z
    .boolean()
    .describe(
      'Whether paid features are available right now. The field to gate subscriber-only UI on: a cancelled agreement inside the period it already paid for reports active:false and entitled:true.'
    ),
  autoRenew: z
    .boolean()
    .describe(
      'Whether anything will charge the card again. Not derivable from entitlement -- a day pass grants access with no agreement behind it.'
    ),
}).openapi({ ref: 'SubscriptionStatus' });

export const subscriptionHistoryItemSchema = z.object({
  id: z.number().int(),
  plan: z.string(),
  status: z.string().describe('active, cancelled, expired or past_due'),
  currentPeriodStart: z.string().describe('ISO 8601'),
  currentPeriodEnd: z.string().describe('ISO 8601'),
}).openapi({ ref: 'SubscriptionHistoryItem' });

export const getSubscriptionHistoryResponseSchema = z.array(subscriptionHistoryItemSchema);

const meDoc = describeRoute({
  summary: "The caller's own subscription",
  description:
    'Answers with 200 and active:false rather than 403 -- "you are not subscribed" is the successful answer to this question, and the page asking it has an upgrade prompt to render.',
  tags: ['subscription'],
  responses: {
    200: {
      description: 'Access, billing and renewal',
      content: { 'application/json': { schema: resolver(subscriptionStatusSchema) } },
    },
  },
});

const historyDoc = describeRoute({
  summary: 'Every period the caller has had',
  description:
    'Newest first. Renewals, lapses and cancellations are each their own row, so this is where a client derives "cancelled but still usable" from.',
  tags: ['subscription'],
  responses: {
    200: {
      description: 'The periods, newest first',
      content: { 'application/json': { schema: resolver(getSubscriptionHistoryResponseSchema) } },
    },
  },
});

const cancelDoc = describeRoute({
  summary: 'Turn auto-renew off',
  description:
    'Entitlement is not revoked: the period already paid for runs to its end, so the response normally reports active:false with entitled:true. One-way -- resubscribing means a new agreement, whose first charge is immediate.',
  tags: ['subscription'],
  responses: {
    200: {
      description: 'The status after cancelling, with autoRenew false by definition',
      content: { 'application/json': { schema: resolver(subscriptionStatusSchema) } },
    },
  },
});

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
  .get('/me', meDoc, async (c) => {
    const user = c.get('user');
    console.log(`GET /api/subscription/me userId=${user.id}`);

    const db = c.get('db');
    const [active, entitled, order] = await Promise.all([
      findActiveSubscription(db, user.id),
      findEntitledSubscription(db, user.id),
      findActiveOrder(db, user.id),
    ]);

    return c.json({
      active: active !== undefined,
      plan: active?.plan ?? null,
      // Serialised here rather than left to c.json's own Date handling.
      // The bytes are identical -- JSON.stringify calls toISOString too
      // -- but the type now says what goes on the wire, which is what
      // the schema above and the clients generated from it describe.
      expiresAt: active?.currentPeriodEnd.toISOString() ?? null,
      // Whether paid features are available right now, which `active`
      // does not answer: a cancelled agreement inside its paid period
      // reports active:false and is still entitled. That gap is what
      // showed a cancelled-but-paid user the free-member treatment on a
      // feature the API was happily serving them.
      entitled: entitled !== undefined,
      // Whether anything will charge the card again, which is a
      // different question from whether they have access: a day pass
      // grants access with no agreement behind it. The client needs this
      // to decide whether a cancel button means anything at all --
      // deriving it from entitlement told day-pass buyers their one-off
      // purchase renewed every month.
      autoRenew: order !== undefined,
    } satisfies z.infer<typeof subscriptionStatusSchema>);
  })
  /**
   * Every period the user has had, newest first -- renewals, lapses and
   * cancellations included, since each is its own row.
   */
  .get('/history', historyDoc, async (c) => {
    const user = c.get('user');
    console.log(`GET /api/subscription/history userId=${user.id}`);

    const periods = await listSubscriptionHistory(c.get('db'), user.id);

    return c.json(
      periods.map(({ id, plan, status, currentPeriodStart, currentPeriodEnd }) => ({
        id,
        plan,
        status,
        // Listed field by field rather than spread, so a column added to
        // the query cannot reach the response without being described.
        currentPeriodStart: currentPeriodStart.toISOString(),
        currentPeriodEnd: currentPeriodEnd.toISOString(),
      })) satisfies z.infer<typeof getSubscriptionHistoryResponseSchema>
    );
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
  .post('/cancel', cancelDoc, async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    console.log(`POST /api/subscription/cancel userId=${user.id}`);

    const order = await findActiveOrder(db, user.id);

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
    const [active, entitled] = await Promise.all([
      findActiveSubscription(db, user.id),
      findEntitledSubscription(db, user.id),
    ]);

    return c.json({
      active: active !== undefined,
      plan: active?.plan ?? null,
      expiresAt: active?.currentPeriodEnd.toISOString() ?? null,
      // Normally true right after a cancel: the period just paid for runs
      // to its end. This is the field that keeps the subscriber-only
      // parts of the UI switched on for the rest of it.
      entitled: entitled !== undefined,
      // False by definition once this route has run: either there was an
      // agreement and it has just been cancelled, or there never was
      // one and the caller's intent was already true.
      autoRenew: false,
    } satisfies z.infer<typeof subscriptionStatusSchema>);
  });
