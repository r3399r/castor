import { zValidator } from '@hono/zod-validator';
import { asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  categoryTable,
  conceptGroupTable,
  conceptTable,
  subjectCategoryTable,
  subjectTable,
  userConceptStatTable,
  userStatHistoryTable,
  userTable,
} from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT } from 'src/lib/paginator';
import { verifyIdTokenFull } from 'src/lib/firebaseAdmin';
import { requireAdmin } from 'src/middleware/adminAuth';
import { requireUser, UserEnv } from 'src/middleware/requireUser';
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

type DailyMastery = { date: string; weightedMastery: number };

// A user's current streak, counted back from the most recent recorded
// day -- zero unless that day is today or yesterday (missing a day
// resets it), then +1 for every immediately-preceding consecutive day.
const computeStreak = (sortedDatesDesc: string[]): number => {
  if (sortedDatesDesc.length === 0) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (sortedDatesDesc[0] !== today && sortedDatesDesc[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < sortedDatesDesc.length; i++) {
    const prev = new Date(sortedDatesDesc[i - 1]);
    const curr = new Date(sortedDatesDesc[i]);
    const diffDays = Math.round((prev.getTime() - curr.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays === 1) streak++;
    else break;
  }

  return streak;
};

// requireAdmin is applied per-route (not via an app.ts-level wildcard,
// unlike every other resource) because /sync below is the one exception:
// it must be reachable by *any* signed-in Firebase user -- it's the only
// thing that ever creates their user row in the first place, so it can't
// itself depend on that row already existing.
export const user = new Hono<UserEnv>()
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
  })
  // Current mastery per concept group, grouped by subject. A subject only
  // shows up here once the user has an existing user_concept_stat row for
  // at least one of its concepts -- but once it does, every concept group
  // in that subject is included (untouched groups show mastery 0), not
  // just the ones actually attempted.
  .get('/stats', requireUser, async (c) => {
    const user = c.get('user');
    console.log(`GET /api/user/stats userId=${user.id}`);
    const db = c.get('db');

    const stats = await db
      .select({
        conceptId: userConceptStatTable.conceptId,
        mastery: userConceptStatTable.mastery,
        subjectId: conceptGroupTable.subjectId,
      })
      .from(userConceptStatTable)
      .innerJoin(conceptTable, eq(conceptTable.id, userConceptStatTable.conceptId))
      .innerJoin(conceptGroupTable, eq(conceptGroupTable.id, conceptTable.conceptGroupId))
      .where(eq(userConceptStatTable.userId, user.id));
    if (stats.length === 0) return c.json([]);

    const masteryByConcept = new Map(stats.map((s) => [s.conceptId, s.mastery ?? 0]));
    const subjectIds = [...new Set(stats.map((s) => s.subjectId))];

    const [conceptGroups, subjects, categoryLinks] = await Promise.all([
      db
        .select({ id: conceptGroupTable.id, name: conceptGroupTable.name, subjectId: conceptGroupTable.subjectId })
        .from(conceptGroupTable)
        .where(inArray(conceptGroupTable.subjectId, subjectIds)),
      db.select({ id: subjectTable.id, name: subjectTable.name }).from(subjectTable).where(inArray(subjectTable.id, subjectIds)),
      db
        .select({ subjectId: subjectCategoryTable.subjectId, id: categoryTable.id, name: categoryTable.name })
        .from(subjectCategoryTable)
        .innerJoin(categoryTable, eq(categoryTable.id, subjectCategoryTable.categoryId))
        .where(inArray(subjectCategoryTable.subjectId, subjectIds)),
    ]);
    const concepts = await db
      .select({ id: conceptTable.id, conceptGroupId: conceptTable.conceptGroupId, numberOfQuestions: conceptTable.numberOfQuestions })
      .from(conceptTable)
      .where(inArray(conceptTable.conceptGroupId, conceptGroups.map((g) => g.id)));

    const conceptsByGroup = new Map<number, typeof concepts>();
    for (const concept of concepts) {
      const list = conceptsByGroup.get(concept.conceptGroupId) ?? [];
      list.push(concept);
      conceptsByGroup.set(concept.conceptGroupId, list);
    }
    const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));
    const categoriesBySubject = new Map<number, { id: number; name: string }[]>();
    for (const link of categoryLinks) {
      const list = categoriesBySubject.get(link.subjectId) ?? [];
      list.push({ id: link.id, name: link.name });
      categoriesBySubject.set(link.subjectId, list);
    }

    const subjectMap = new Map<
      number,
      { id: number; name: string; category: { id: number; name: string }[]; conceptGroup: { id: number; name: string; mastery: number; numberOfQuestions: number }[] }
    >();
    for (const group of conceptGroups) {
      let totalMastery = 0;
      let totalCount = 0;
      for (const concept of conceptsByGroup.get(group.id) ?? []) {
        const mastery = masteryByConcept.get(concept.id) ?? 0;
        totalMastery += mastery * concept.numberOfQuestions;
        totalCount += concept.numberOfQuestions;
      }

      if (!subjectMap.has(group.subjectId))
        subjectMap.set(group.subjectId, {
          id: group.subjectId,
          name: subjectNameById.get(group.subjectId) ?? '',
          category: categoriesBySubject.get(group.subjectId) ?? [],
          conceptGroup: [],
        });
      subjectMap.get(group.subjectId)!.conceptGroup.push({
        id: group.id,
        name: group.name,
        mastery: totalCount > 0 ? totalMastery / totalCount : 0,
        numberOfQuestions: totalCount,
      });
    }

    return c.json([...subjectMap.values()]);
  })
  // Daily activity/mastery history, aggregated from the per-(user,
  // subject, day) rollups POST /reply upserts. userStatHistoryTable.date
  // is a MySQL DATE column -- read back through the mysql2 driver as a
  // JS Date (in the server's local timezone) rather than the plain
  // 'YYYY-MM-DD' string Drizzle's `mode: 'string'` implies, so it's
  // selected through DATE_FORMAT here to get a reliable, timezone-proof
  // string instead of trusting the driver's own Date coercion.
  .get('/history', requireUser, async (c) => {
    const user = c.get('user');
    console.log(`GET /api/user/history userId=${user.id}`);
    const db = c.get('db');

    const dateExpr = sql<string>`date_format(${userStatHistoryTable.date}, '%Y-%m-%d')`;
    const rows = await db
      .select({
        date: dateExpr,
        subjectId: userStatHistoryTable.subjectId,
        weightedMastery: userStatHistoryTable.weightedMastery,
        dailyAttempts: userStatHistoryTable.dailyAttempts,
        dailyCorrect: userStatHistoryTable.dailyCorrect,
      })
      .from(userStatHistoryTable)
      .where(eq(userStatHistoryTable.userId, user.id));

    if (rows.length === 0)
      return c.json({
        totalAttempts: 0,
        overallAccuracy: 0,
        streakDays: 0,
        overallDailyMastery: [],
        subjectHistory: [],
        activityMap: [],
      });

    let totalAttempts = 0;
    let totalCorrect = 0;
    const dateSubjectMap = new Map<string, Map<number, { mastery: number | null; attempts: number }>>();
    for (const row of rows) {
      totalAttempts += row.dailyAttempts;
      totalCorrect += row.dailyCorrect;

      if (!dateSubjectMap.has(row.date)) dateSubjectMap.set(row.date, new Map());
      dateSubjectMap.get(row.date)!.set(row.subjectId, { mastery: row.weightedMastery, attempts: row.dailyAttempts });
    }

    const sortedDatesDesc = [...dateSubjectMap.keys()].sort().reverse();
    const streakDays = computeStreak(sortedDatesDesc);

    const subjectIds = [...new Set(rows.map((r) => r.subjectId))];
    const [subjects, conceptGroups] = await Promise.all([
      db.select({ id: subjectTable.id, name: subjectTable.name }).from(subjectTable).where(inArray(subjectTable.id, subjectIds)),
      db
        .select({ subjectId: conceptGroupTable.subjectId, id: conceptGroupTable.id })
        .from(conceptGroupTable)
        .where(inArray(conceptGroupTable.subjectId, subjectIds)),
    ]);
    const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));
    const concepts =
      conceptGroups.length > 0
        ? await db
            .select({ conceptGroupId: conceptTable.conceptGroupId, numberOfQuestions: conceptTable.numberOfQuestions })
            .from(conceptTable)
            .where(inArray(conceptTable.conceptGroupId, conceptGroups.map((g) => g.id)))
        : [];
    const groupSubjectById = new Map(conceptGroups.map((g) => [g.id, g.subjectId]));
    const subjectQuestionCount = new Map<number, number>();
    for (const concept of concepts) {
      const subjectId = groupSubjectById.get(concept.conceptGroupId);
      if (subjectId === undefined) continue;
      subjectQuestionCount.set(subjectId, (subjectQuestionCount.get(subjectId) ?? 0) + concept.numberOfQuestions);
    }

    // Overall daily mastery: weighted average across subjects touched
    // that day, weighted by each subject's total question count.
    const sparseMastery = new Map<string, number>(
      [...dateSubjectMap.entries()].map(([date, subjectEntries]) => {
        let weightedSum = 0;
        let totalQ = 0;
        for (const [subjectId, { mastery }] of subjectEntries) {
          if (mastery === null) continue;
          const q = subjectQuestionCount.get(subjectId) ?? 0;
          weightedSum += mastery * q;
          totalQ += q;
        }
        return [date, totalQ > 0 ? weightedSum / totalQ : 0];
      })
    );

    const fillDaily = (sparse: Map<string, number>, firstDate: string): DailyMastery[] => {
      const today = new Date().toISOString().slice(0, 10);
      const out: DailyMastery[] = [];
      let last = 0;
      const cursor = new Date(`${firstDate}T00:00:00Z`);
      const end = new Date(`${today}T00:00:00Z`);
      while (cursor <= end) {
        const dateStr = cursor.toISOString().slice(0, 10);
        if (sparse.has(dateStr)) last = sparse.get(dateStr)!;
        out.push({ date: dateStr, weightedMastery: last });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      return out;
    };

    const overallDailyMastery = fillDaily(sparseMastery, [...sparseMastery.keys()].sort()[0]);

    const subjectSparseMastery = new Map<number, Map<string, number>>();
    for (const row of rows) {
      if (row.weightedMastery === null) continue;
      if (!subjectSparseMastery.has(row.subjectId)) subjectSparseMastery.set(row.subjectId, new Map());
      subjectSparseMastery.get(row.subjectId)!.set(row.date, row.weightedMastery);
    }
    const subjectHistory = [...subjectSparseMastery.entries()].map(([subjectId, sparse]) => ({
      subjectId,
      subjectName: subjectNameById.get(subjectId) ?? '',
      dailyStats: fillDaily(sparse, [...sparse.keys()].sort()[0]),
    }));

    const activityMap = [...dateSubjectMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, subjectEntries]) => ({
        date,
        count: [...subjectEntries.values()].reduce((sum, e) => sum + e.attempts, 0),
      }));

    const overallAccuracy = totalAttempts > 0 ? (totalCorrect / totalAttempts / 10) * 100 : 0;

    return c.json({
      totalAttempts,
      overallAccuracy,
      streakDays,
      overallDailyMastery,
      subjectHistory,
      activityMap,
    });
  })
  // Registered after the other static routes (/sync, /stats, /history) --
  // as a dynamic segment, this would otherwise swallow requests to any of
  // them (Hono matches routes in registration order, not by specificity).
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
  });
