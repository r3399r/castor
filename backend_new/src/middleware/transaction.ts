import { createMiddleware } from 'hono/factory';
import { getDb } from 'src/db/client';

// Derived from getDb() itself rather than naming Drizzle's transaction
// type directly -- MySqlTransaction takes driver-specific HKT generics
// that aren't worth hand-instantiating and would drift from the actual
// mysql2 driver's inferred type across Drizzle versions.
type Transaction = Parameters<
  Parameters<ReturnType<typeof getDb>['transaction']>[0]
>[0];

export type TransactionEnv = { Variables: { db: Transaction } };

/**
 * Drizzle's db.transaction(callback) acquires a connection from the pool,
 * starts a transaction, and commits/releases automatically when the
 * callback resolves, or rolls back/releases if it throws -- no manual
 * connect/start/commit/rollback/release bookkeeping needed here, unlike
 * the old QueryRunner-based version.
 *
 * The one wrinkle: Hono's onError intercepts a handler's thrown error and
 * builds the response before it can reject back through this callback --
 * next() resolves normally either way, so we check c.error (Hono's
 * documented signal for exactly this) and rethrow it so Drizzle sees a
 * failure and rolls back instead of auto-committing. That rethrow is only
 * to make Drizzle roll back; onError already built the real response, so
 * it's swallowed afterwards rather than left to become a second error.
 * If c.error is unset, the throw is a genuinely new failure (e.g. the pool
 * couldn't hand out a connection) and still needs to reach onError.
 */
export const transaction = createMiddleware<TransactionEnv>(
  async (c, next) => {
    try {
      await getDb().transaction(async (tx) => {
        c.set('db', tx);
        await next();
        if (c.error) throw c.error;
      });
    } catch (e) {
      if (!c.error) throw e;
    }
  }
);
