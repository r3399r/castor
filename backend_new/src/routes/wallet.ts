import { zValidator } from '@hono/zod-validator';
import { desc, eq, count } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { pointTransactionTable } from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT } from 'src/lib/paginator';
import { UserEnv } from 'src/middleware/requireUser';

export const walletListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

type PointTransactionDto = {
  id: number;
  type: string;
  amount: number;
  replyId: number | null;
  balanceAfter: number;
  createdAt: string | null;
};

export const wallet = new Hono<UserEnv>().get(
  '/',
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

    const data: PointTransactionDto[] = rows.map((row) => ({
      id: row.id,
      type: row.type,
      amount: row.amount,
      replyId: row.replyId,
      balanceAfter: row.balanceAfter,
      createdAt: row.createdAt?.toISOString() ?? null,
    }));

    return c.json({ data, paginate: genPagination(total, limit, offset) });
  }
);
