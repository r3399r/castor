import { and, count, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  categoryTable,
  examTable,
  questionTable,
  subjectTable,
  userTable,
} from 'src/db/schema';
import { TransactionEnv } from 'src/middleware/transaction';

export const info = new Hono<TransactionEnv>()
  // Deliberately touches no table: this is the health check, and it has to
  // keep answering 200 while the database is unreachable. The transaction
  // middleware is therefore bound to /api/info/stats alone in app.ts, not
  // to /api/info/*, which would also catch this path.
  .get('/', (c) => c.json({ status: 'ok', time: new Date().toISOString() }))
  // Public and unauthenticated -- it only feeds the landing page's counter
  // bar, so it reports catalog sizes and nothing per-user.
  .get('/stats', async (c) => {
    console.log('GET /api/info/stats');
    const db = c.get('db');

    // Five sequential COUNT(*)s rather than one select of scalar
    // subqueries: they share this request's transaction, so the numbers
    // are still read from one consistent snapshot, and mysql2 can't
    // pipeline concurrent queries on a single connection anyway.
    const [{ total: categoryCount }] = await db
      .select({ total: count() })
      .from(categoryTable);
    const [{ total: subjectCount }] = await db
      .select({ total: count() })
      .from(subjectTable);
    const [{ total: examCount }] = await db
      .select({ total: count() })
      .from(examTable);

    // Same definition of "a question" as GET /api/question/count: the
    // top-level rows that are actually servable. A 題組's children aren't
    // counted separately (the parent is the one question a user is given),
    // and enabled only ever means anything on a top-level row.
    const [{ total: questionCount }] = await db
      .select({ total: count() })
      .from(questionTable)
      .where(and(isNull(questionTable.parentId), eq(questionTable.enabled, true)));

    const [{ total: userCount }] = await db
      .select({ total: count() })
      .from(userTable);

    return c.json({
      categoryCount,
      subjectCount,
      examCount,
      questionCount,
      userCount,
    });
  });
