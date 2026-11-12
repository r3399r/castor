import 'zod-openapi/extend';
import { zValidator } from '@hono/zod-validator';
import { desc, eq, count } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { pointTransactionTable } from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT, paginationSchema } from 'src/lib/paginator';
import { UserEnv } from 'src/middleware/requireUser';

export const walletListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

/**
 * One movement of points, as this API reports it.
 *
 * A schema rather than the hand-written DTO that used to sit here: it is
 * the single description of the response, the handler's return is
 * checked against it, and the OpenAPI document is generated from it.
 * See "The OpenAPI document" in AGENTS.md.
 */
export const pointTransactionSchema = z.object({
  id: z.number().int(),
  type: z
    .string()
    .describe(
      'EARN_REPLY, SPEND_EGG_REDEEM and the rest -- a varchar rather than an enum, so a new kind of movement needs no schema change'
    ),
  amount: z.number().int().describe('Signed: negative is a spend'),
  replyId: z
    .number()
    .int()
    .nullable()
    .describe('The reply this came from, for anything earned by answering'),
  balanceAfter: z.number().int().describe('The running balance once this had been applied'),
  createdAt: z.string().nullable().describe('ISO 8601'),
}).openapi({ ref: 'PointTransaction' });

export const getWalletResponseSchema = z.object({
  data: z.array(pointTransactionSchema),
  paginate: paginationSchema,
});

const listDoc = describeRoute({
  summary: "The caller's point history",
  description:
    "Behind requireUser, and scoped to the caller: there is no way to read anyone else's. Newest first, ordered by id rather than createdAt -- a POST /reply batch writes several rows sharing one timestamp, so id is the only column that keeps their order.",
  tags: ['wallet'],
  responses: {
    200: {
      description: 'One page of movements, newest first',
      content: { 'application/json': { schema: resolver(getWalletResponseSchema) } },
    },
    400: { description: 'limit beyond the cap, or a malformed offset' },
    401: { description: 'No valid identity' },
  },
});

export const wallet = new Hono<UserEnv>().get(
  '/',
  listDoc,
  zValidator('query', walletListQuerySchema),
  async (c) => {
    const { limit, offset } = c.req.valid('query');
    const user = c.get('user');
    const db = c.get('db');
    console.log(`GET /api/wallet userId=${user.id} limit=${limit} offset=${offset}`);

    const [{ total }] = await db
      .select({ total: count() })
      .from(pointTransactionTable)
      .where(eq(pointTransactionTable.userId, user.id));

    // Ordered by id (not createdAt) -- multiple transactions from the same
    // POST /reply batch share one createdAt timestamp, so id is the only
    // column that reliably preserves within-batch order.
    const rows = await db
      .select()
      .from(pointTransactionTable)
      .where(eq(pointTransactionTable.userId, user.id))
      .orderBy(desc(pointTransactionTable.id))
      .limit(limit)
      .offset(offset);

    const data: z.infer<typeof pointTransactionSchema>[] = rows.map((row) => ({
      id: row.id,
      type: row.type,
      amount: row.amount,
      replyId: row.replyId,
      balanceAfter: row.balanceAfter,
      createdAt: row.createdAt?.toISOString() ?? null,
    }));

    return c.json({
      data,
      paginate: genPagination(total, limit, offset),
    } satisfies z.infer<typeof getWalletResponseSchema>);
  }
);
