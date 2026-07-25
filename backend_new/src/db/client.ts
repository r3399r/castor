import { drizzle, MySql2Database } from 'drizzle-orm/mysql2';
import { createPool, Pool } from 'mysql2/promise';

let pool: Pool | undefined;
let db: MySql2Database | undefined;

/**
 * One pool per Lambda execution environment, reused across warm invocations
 * and never torn down -- same reasoning as before: pool size is capped
 * explicitly since each concurrent execution environment gets its own pool,
 * and an uncapped pool multiplies against however many containers are warm
 * at once. This cap just keeps a single container polite; it doesn't solve
 * connection-storm risk under high concurrency -- put this behind RDS Proxy
 * for that.
 */
export const getDb = (): MySql2Database => {
  if (db === undefined) {
    pool = createPool({
      host: process.env.DB_HOST,
      port: 3306,
      user: process.env.PROJECT,
      password: process.env.DB_PWD,
      database: process.env.PROJECT,
      connectionLimit: Number(process.env.DB_POOL_SIZE ?? 2),
    });
    db = drizzle(pool);
  }

  return db;
};

/**
 * Test-only teardown. Never called from the Lambda handler path -- warm
 * containers are meant to keep the pool open for reuse, as noted above.
 */
export const closeDb = async (): Promise<void> => {
  await pool?.end();
  pool = undefined;
  db = undefined;
};
