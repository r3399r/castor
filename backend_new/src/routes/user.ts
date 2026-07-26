import { zValidator } from '@hono/zod-validator';
import { asc, count, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { userTable } from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT } from 'src/lib/paginator';
import { TransactionEnv } from 'src/middleware/transaction';
import { NotFoundError } from 'src/model/error';

const USER_SORT_COLUMNS = {
  id: userTable.id,
  email: userTable.email,
  name: userTable.name,
  lastLoginAt: userTable.lastLoginAt,
};

export const userListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sort: z.enum(['id', 'email', 'name', 'lastLoginAt']).optional().default('id'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

// Read-only on purpose: rows come from the app's own Firebase sign-in
// flow, never from this admin panel, so there's deliberately no
// POST/PUT/DELETE here -- just list and get-by-id.
export const user = new Hono<TransactionEnv>()
  .get('/', zValidator('query', userListQuerySchema), async (c) => {
    const { limit, offset, sort, order } = c.req.valid('query');
    console.log(
      `GET /api/user limit=${limit} offset=${offset} sort=${sort} order=${order}`
    );
    const db = c.get('db');

    const [{ total }] = await db.select({ total: count() }).from(userTable);
    const sortColumn = USER_SORT_COLUMNS[sort];
    const data = await db
      .select()
      .from(userTable)
      .orderBy(order === 'desc' ? desc(sortColumn) : asc(sortColumn))
      .limit(limit)
      .offset(offset);

    return c.json({ data, paginate: genPagination(total, limit, offset) });
  })
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    console.log(`GET /api/user/${id}`);
    const [found] = await c
      .get('db')
      .select()
      .from(userTable)
      .where(eq(userTable.id, Number(id)));
    if (found === undefined) throw new NotFoundError(`user ${id} not found`);

    return c.json(found);
  });
