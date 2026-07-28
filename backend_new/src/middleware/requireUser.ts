import { createMiddleware } from 'hono/factory';
import { eq } from 'drizzle-orm';
import { userTable } from 'src/db/schema';
import { verifyIdTokenUid } from 'src/lib/firebaseAdmin';
import { UnauthorizedError } from 'src/model/error';
import { TransactionEnv } from './transaction';

export type UserEnv = TransactionEnv & {
  Variables: TransactionEnv['Variables'] & { user: typeof userTable.$inferSelect };
};

/**
 * Frontend sends the raw Firebase ID token as the Authorization header
 * value (no "Bearer " prefix), same convention as adminAuth. Unlike
 * adminAuth, this resolves to an app user row (by firebase_uid) rather
 * than checking an admin allowlist -- for routes that need to know
 * *which* signed-in user is asking, not just admin-or-not. Must run
 * after transaction (needs c.get('db')).
 */
export const requireUser = createMiddleware<UserEnv>(async (c, next) => {
  const uid = await verifyIdTokenUid(c.req.header('Authorization'));
  if (uid === null) throw new UnauthorizedError('Sign-in required');

  const db = c.get('db');
  const [user] = await db.select().from(userTable).where(eq(userTable.firebaseUid, uid));
  if (user === undefined) throw new UnauthorizedError('Sign-in required');

  c.set('user', user);
  await next();
});
