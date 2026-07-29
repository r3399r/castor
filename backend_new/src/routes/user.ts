import { zValidator } from '@hono/zod-validator';
import { asc, count, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { userTable } from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT } from 'src/lib/paginator';
import { verifyIdTokenFull } from 'src/lib/firebaseAdmin';
import { requireAdmin } from 'src/middleware/adminAuth';
import { TransactionEnv } from 'src/middleware/transaction';
import { NotFoundError, UnauthorizedError } from 'src/model/error';

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

// requireAdmin is applied per-route (not via an app.ts-level wildcard,
// unlike every other resource) because /sync below is the one exception:
// it must be reachable by *any* signed-in Firebase user -- it's the only
// thing that ever creates their user row in the first place, so it can't
// itself depend on that row already existing.
export const user = new Hono<TransactionEnv>()
  .get('/', requireAdmin, zValidator('query', userListQuerySchema), async (c) => {
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
  .get('/:id', requireAdmin, async (c) => {
    const id = c.req.param('id');
    console.log(`GET /api/user/${id}`);
    const [found] = await c
      .get('db')
      .select()
      .from(userTable)
      .where(eq(userTable.id, Number(id)));
    if (found === undefined) throw new NotFoundError(`user ${id} not found`);

    return c.json(found);
  })
  // Find-or-create by firebase_uid, called on every sign-in. Only
  // lastLoginAt is refreshed for a returning user -- matching the legacy
  // version, a changed name/email/avatar on the Firebase side doesn't
  // get written back here.
  .post('/sync', async (c) => {
    const identity = await verifyIdTokenFull(c.req.header('Authorization'));
    if (identity === null) throw new UnauthorizedError('Sign-in required');
    console.log(`POST /api/user/sync uid=${identity.uid}`);
    const db = c.get('db');

    const now = new Date();
    const [existing] = await db.select().from(userTable).where(eq(userTable.firebaseUid, identity.uid));

    if (existing) {
      await db.update(userTable).set({ lastLoginAt: now, updatedAt: now }).where(eq(userTable.id, existing.id));
      const [updated] = await db.select().from(userTable).where(eq(userTable.id, existing.id));
      return c.json(updated);
    }

    const [{ insertId }] = await db.insert(userTable).values({
      firebaseUid: identity.uid,
      email: identity.email,
      name: identity.name,
      avatar: identity.picture,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const [created] = await db.select().from(userTable).where(eq(userTable.id, insertId));
    return c.json(created, 201);
  });
