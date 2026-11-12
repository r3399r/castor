import { zValidator } from '@hono/zod-validator';
import { asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import {
  categoryTable,
  conceptGroupTable,
  conceptTable,
  pointTransactionTable,
  subjectCategoryTable,
  subjectTable,
  userConceptStatTable,
  userTable,
} from 'src/db/schema';
import { buildDateSubjectMap, loadMasteryHistoryRows } from 'src/lib/masteryHistory';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT } from 'src/lib/paginator';
import {
  findActiveSubscription,
  findActiveSubscriptions,
  findEntitledSubscription,
  setSubscription,
} from 'src/lib/subscription';
import { verifyIdTokenFull } from 'src/lib/firebaseAdmin';
import { requireAdmin } from 'src/middleware/adminAuth';
import { requireUser, UserEnv } from 'src/middleware/requireUser';
import { BadRequestError, NotFoundError, UnauthorizedError } from 'src/model/error';
import { subscriptionStatusSchema } from 'src/routes/subscription';

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

// Trimmed server-side (not just relying on the frontend) so a name that's
// all whitespace can't sneak through as "set".
export const userUpdateMeBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
});

// Bounded well below INT UNSIGNED's ceiling so a mistyped delta cannot
// overflow total_points instead of failing. Nonzero because a no-op would
// still write a ledger row, which is noise in the history this endpoint
// exists to keep honest.
export const userPointsBodySchema = z.object({
  delta: z
    .number()
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((value) => value !== 0, { message: 'delta must not be 0' }),
});

export const userSubscriptionBodySchema = z.object({
  active: z.boolean(),
  plan: z.string().min(1).max(32).optional(),
  // Length of the granted period. Ignored when active is false.
  days: z.number().int().positive().max(3650).optional(),
});

/**
 * A user as this API reports them.
 *
 * The date columns are `Date` objects in the row and ISO strings on the
 * wire -- `c.json` calls toISOString for you -- so the DTO below does it
 * explicitly instead. Same bytes, but the type now says what is actually
 * sent, which is what the generated document and its clients describe.
 */
export const userSchema = z.object({
  id: z.number().int(),
  firebaseUid: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  avatar: z.string().nullable(),
  totalPoints: z.number().int().describe('Spendable balance; decreases when spent'),
  lifetimePoints: z.number().int().describe('Only ever increases; the leaderboard ranks on this'),
  lastLoginAt: z.string().nullable().describe('ISO 8601'),
  createdAt: z.string().nullable().describe('ISO 8601'),
  updatedAt: z.string().nullable().describe('ISO 8601'),
});

/**
 * Listed field by field rather than spread, so a column added to the
 * user table cannot reach a response without being described first.
 */
const toUserDto = (row: {
  id: number;
  firebaseUid: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  totalPoints: number;
  lifetimePoints: number;
  lastLoginAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}): z.infer<typeof userSchema> => ({
  id: row.id,
  firebaseUid: row.firebaseUid,
  email: row.email,
  name: row.name,
  avatar: row.avatar,
  totalPoints: row.totalPoints,
  lifetimePoints: row.lifetimePoints,
  lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
  createdAt: row.createdAt?.toISOString() ?? null,
  updatedAt: row.updatedAt?.toISOString() ?? null,
});

/**
 * Billing only -- three of the five fields GET /subscription/me answers
 * with, picked from that schema so the shared fields cannot drift apart.
 *
 * `entitled` and `autoRenew` are missing because each would be another
 * query per row, and the admin list only needs to show and toggle
 * billing. packages/shared types these responses as the full
 * SubscriptionStatus, which has been wrong since they were written: this
 * is what they actually send.
 */
const subscriptionBillingSchema = subscriptionStatusSchema.pick({
  active: true,
  plan: true,
  expiresAt: true,
});

/**
 * What sign-in reports: billing plus entitlement, but still no
 * autoRenew.
 *
 * Nothing reads autoRenew off a sync response today -- the only caller,
 * deriveSubscriptionView in the webapp, is fed from GET
 * /subscription/me -- so this is a type that overstates rather than a
 * bug. Adding the field would cost one findActiveOrder per sign-in; see
 * AGENTS.md.
 */
const syncSubscriptionSchema = subscriptionBillingSchema.extend({
  entitled: subscriptionStatusSchema.shape.entitled,
});

const paginateSchema = z.object({
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totalPages: z.number().int(),
});

export const getUserListResponseSchema = z.object({
  data: z.array(userSchema.extend({ subscription: subscriptionBillingSchema })),
  paginate: paginateSchema,
});

export const postUserSyncResponseSchema = userSchema.extend({
  subscription: syncSubscriptionSchema,
});

export const getUserStatsResponseSchema = z.array(
  z.object({
    id: z.number().int(),
    name: z.string(),
    /**
     * Only the id and name, although packages/shared types this as the
     * full Category (which carries createdAt too). What is sent is this.
     */
    category: z.array(z.object({ id: z.number().int(), name: z.string() })),
    conceptGroup: z.array(
      z.object({
        id: z.number().int(),
        name: z.string(),
        mastery: z
          .number()
          .describe('Question-weighted mean mastery across the group, 0 when untouched'),
        numberOfQuestions: z.number().int(),
      })
    ),
  })
);

export const getUserHistoryResponseSchema = z.object({
  totalAttempts: z.number().int(),
  overallAccuracy: z.number().describe('Percentage, 0 when nothing has been attempted'),
  streakDays: z
    .number()
    .int()
    .describe('Consecutive days up to today or yesterday; missing a day resets it'),
  activityMap: z.array(z.object({ date: z.string().describe('YYYY-MM-DD'), count: z.number().int() })),
});

export const putUserSubscriptionResponseSchema = subscriptionBillingSchema;

export const putUserPointsResponseSchema = z.object({
  totalPoints: z.number().int(),
  lifetimePoints: z.number().int(),
  delta: z.number().int().describe('The adjustment that was applied, echoed back'),
});

const listDoc = describeRoute({
  summary: 'List users (admin)',
  description: "One page of users with each one's billing state.",
  tags: ['user', 'admin'],
  responses: {
    200: {
      description: 'A page of users',
      content: { 'application/json': { schema: resolver(getUserListResponseSchema) } },
    },
    403: { description: 'Not an admin' },
  },
});

const syncDoc = describeRoute({
  summary: 'Find or create the caller from their Firebase identity',
  description:
    "Called on every sign-in; the only thing that ever creates a user row, which is why it is the one route here not behind requireUser. Returns 201 when it created the row. Only lastLoginAt is refreshed for a returning user -- a changed name or avatar on the Firebase side is not written back. The caller's subscription comes with it so sign-in needs one authenticated request rather than two.",
  tags: ['user'],
  responses: {
    200: {
      description: 'The existing user',
      content: { 'application/json': { schema: resolver(postUserSyncResponseSchema) } },
    },
    201: {
      description: 'The user that was just created',
      content: { 'application/json': { schema: resolver(postUserSyncResponseSchema) } },
    },
    401: { description: 'No valid Firebase identity' },
  },
});

const statsDoc = describeRoute({
  summary: "The caller's mastery per concept group",
  description:
    'Grouped by subject. A subject appears once the user has a stat row for any of its concepts -- and then every concept group in that subject is included, untouched ones at mastery 0.',
  tags: ['user'],
  responses: {
    200: {
      description: 'Subjects, each with its concept groups',
      content: { 'application/json': { schema: resolver(getUserStatsResponseSchema) } },
    },
  },
});

const historyDoc = describeRoute({
  summary: "The caller's totals, streak and activity heatmap",
  description:
    'The mastery-over-time series this used to carry is subscriber-only and lives in GET /api/analysis/overview -- dropped from this payload rather than hidden in the UI, so the paywall is not merely decorative.',
  tags: ['user'],
  responses: {
    200: {
      description: 'Totals and the per-day attempt counts',
      content: { 'application/json': { schema: resolver(getUserHistoryResponseSchema) } },
    },
  },
});

const putSubscriptionDoc = describeRoute({
  summary: "Grant or revoke a user's subscription (admin)",
  description:
    'Exists because a granted subscription has no payment behind it: without this the only way to exercise anything behind the paywall is to write to the database by hand. Idempotent in both directions.',
  tags: ['user', 'admin'],
  responses: {
    200: {
      description: 'The billing state afterwards',
      content: { 'application/json': { schema: resolver(putUserSubscriptionResponseSchema) } },
    },
    400: { description: 'Malformed body' },
    403: { description: 'Not an admin' },
    404: { description: 'No such user' },
  },
});

const putPointsDoc = describeRoute({
  summary: "Adjust a user's point balance by hand (admin)",
  description:
    'Writes a real ledger row as well as moving the balance, so SUM(point_transaction.amount) still reconciles. Earning raises both balances and spending lowers only totalPoints, so +100 then -100 leaves lifetimePoints 100 higher -- correct, not a leak.',
  tags: ['user', 'admin'],
  responses: {
    200: {
      description: 'The balances afterwards',
      content: { 'application/json': { schema: resolver(putUserPointsResponseSchema) } },
    },
    400: { description: 'Malformed body, or a delta of 0' },
    403: { description: 'Not an admin' },
    404: { description: 'No such user' },
  },
});

const meDoc = describeRoute({
  summary: "The caller's own profile",
  tags: ['user'],
  responses: {
    200: { description: 'The user', content: { 'application/json': { schema: resolver(userSchema) } } },
  },
});

const putMeDoc = describeRoute({
  summary: "Rename the caller",
  description:
    'Name is the only self-editable field: email, avatar and firebaseUid stay whatever the last sign-in set them to.',
  tags: ['user'],
  responses: {
    200: {
      description: 'The updated user',
      content: { 'application/json': { schema: resolver(userSchema) } },
    },
    400: { description: 'Empty or over-long name' },
  },
});

const getByIdDoc = describeRoute({
  summary: 'Read any user (admin)',
  tags: ['user', 'admin'],
  responses: {
    200: { description: 'The user', content: { 'application/json': { schema: resolver(userSchema) } } },
    403: { description: 'Not an admin' },
    404: { description: 'No such user' },
  },
});

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
  .get('/', requireAdmin, listDoc, zValidator('query', userListQuerySchema), async (c) => {
    const { limit, offset, sort, order } = c.req.valid('query');
    console.log(
      `GET /api/user limit=${limit} offset=${offset} sort=${sort} order=${order}`
    );
    const db = c.get('db');

    const [{ total }] = await db.select({ total: count() }).from(userTable);
    const sortColumn = USER_SORT_COLUMNS[sort];
    const rows = await db
      .select()
      .from(userTable)
      .orderBy(order === 'desc' ? desc(sortColumn) : asc(sortColumn))
      .limit(limit)
      .offset(offset);

    // One extra query for the whole page rather than one per row, so the
    // admin list can show and toggle entitlement without a second
    // round trip per user.
    const subscriptions = await findActiveSubscriptions(
      db,
      rows.map((r) => r.id)
    );
    const data = rows.map((row) => {
      const active = subscriptions.get(row.id);
      return {
        ...toUserDto(row),
        subscription: {
          active: active !== undefined,
          plan: active?.plan ?? null,
          expiresAt: active?.currentPeriodEnd.toISOString() ?? null,
        },
      };
    });

    return c.json({
      data,
      paginate: genPagination(total, limit, offset),
    } satisfies z.infer<typeof getUserListResponseSchema>);
  })
  // Find-or-create by firebase_uid, called on every sign-in. Only
  // lastLoginAt is refreshed for a returning user -- matching the legacy
  // version, a changed name/email/avatar on the Firebase side doesn't
  // get written back here.
  // Carries the caller's subscription status as well as their row.
  // Sync is what every client calls on sign-in, so folding the status in
  // here saves a second authenticated round trip before the UI can
  // decide what the user is entitled to see. GET /subscription/me stays
  // for refreshing it mid-session without a full sync.
  .post('/sync', syncDoc, async (c) => {
    const identity = await verifyIdTokenFull(c.req.header('Authorization'));
    if (identity === null) throw new UnauthorizedError('Sign-in required');
    console.log(`POST /api/user/sync uid=${identity.uid}`);
    const db = c.get('db');

    const now = new Date();
    const [existing] = await db.select().from(userTable).where(eq(userTable.firebaseUid, identity.uid));

    if (existing) {
      await db.update(userTable).set({ lastLoginAt: now, updatedAt: now }).where(eq(userTable.id, existing.id));
      const [updated] = await db.select().from(userTable).where(eq(userTable.id, existing.id));
      // Both, in one round trip: `active` is the billing state and
      // `entitled` is whether paid features are on, and they differ for
      // a cancelled agreement that has not run out yet. Sign-in is the
      // only place the client gets this before its first
      // /subscription/me, so a missing `entitled` here means the paid UI
      // starts off wrong for exactly those users.
      const [active, entitled] = await Promise.all([
        findActiveSubscription(db, existing.id),
        findEntitledSubscription(db, existing.id),
      ]);
      return c.json({
        ...toUserDto(updated),
        subscription: {
          active: active !== undefined,
          plan: active?.plan ?? null,
          expiresAt: active?.currentPeriodEnd.toISOString() ?? null,
          entitled: entitled !== undefined,
        },
      } satisfies z.infer<typeof postUserSyncResponseSchema>);
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
    // No lookup on this path: the row was created a moment ago, so it
    // cannot have a subscription yet. Still reported, so the client never
    // has to branch on the status code to find the field.
    return c.json(
      {
        ...toUserDto(created),
        subscription: { active: false, plan: null, expiresAt: null, entitled: false },
      } satisfies z.infer<typeof postUserSyncResponseSchema>,
      201
    );
  })
  // Current mastery per concept group, grouped by subject. A subject only
  // shows up here once the user has an existing user_concept_stat row for
  // at least one of its concepts -- but once it does, every concept group
  // in that subject is included (untouched groups show mastery 0), not
  // just the ones actually attempted.
  .get('/stats', requireUser, statsDoc, async (c) => {
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
    if (stats.length === 0) return c.json([] satisfies z.infer<typeof getUserStatsResponseSchema>);

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

    return c.json([...subjectMap.values()] satisfies z.infer<typeof getUserStatsResponseSchema>);
  })
  // Daily activity/mastery history, aggregated from the per-(user,
  // subject, day) rollups POST /reply upserts. userStatHistoryTable.date
  // is a MySQL DATE column -- read back through the mysql2 driver as a
  // JS Date (in the server's local timezone) rather than the plain
  // 'YYYY-MM-DD' string Drizzle's `mode: 'string'` implies, so it's
  // selected through DATE_FORMAT here to get a reliable, timezone-proof
  // string instead of trusting the driver's own Date coercion.
  // Totals, streak and the activity heatmap only.
  //
  // The mastery-over-time series this used to carry
  // (overallDailyMastery / subjectHistory) is subscriber-only and now
  // comes from GET /api/analysis/overview. Dropped from the payload
  // rather than merely hidden in the UI: leaving it in the response
  // would make the paywall decorative for anyone opening the network
  // tab. Losing it also means this route no longer needs the subject
  // and concept joins that only ever fed the weighting.
  .get('/history', requireUser, historyDoc, async (c) => {
    const user = c.get('user');
    console.log(`GET /api/user/history userId=${user.id}`);
    const db = c.get('db');

    const rows = await loadMasteryHistoryRows(db, user.id);

    if (rows.length === 0)
      return c.json({
        totalAttempts: 0,
        overallAccuracy: 0,
        streakDays: 0,
        activityMap: [],
      } satisfies z.infer<typeof getUserHistoryResponseSchema>);

    let totalAttempts = 0;
    let totalCorrect = 0;
    for (const row of rows) {
      totalAttempts += row.dailyAttempts;
      totalCorrect += row.dailyCorrect;
    }

    const dateSubjectMap = buildDateSubjectMap(rows);
    const sortedDatesDesc = [...dateSubjectMap.keys()].sort().reverse();
    const streakDays = computeStreak(sortedDatesDesc);

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
      activityMap,
    } satisfies z.infer<typeof getUserHistoryResponseSchema>);
  })
  /**
   * Grants or revokes a user's subscription. Admin only.
   *
   * Exists because there is no payment integration yet: without it the
   * only way to exercise anything behind the paywall is to write to the
   * database by hand. Deliberately NOT something a user can call on
   * themselves -- that would let anyone grant themselves paid features
   * and make the gate decorative.
   *
   * Idempotent in both directions, so the button can be clicked twice
   * without creating a second period or failing.
   */
  .put(
    '/:id/subscription',
    requireAdmin,
    putSubscriptionDoc,
    zValidator('json', userSubscriptionBodySchema),
    async (c) => {
      const db = c.get('db');
      const id = Number(c.req.param('id'));
      const { active, plan, days } = c.req.valid('json');
      console.log(`PUT /api/user/${id}/subscription active=${active}`);

      const [found] = await db.select().from(userTable).where(eq(userTable.id, id));
      if (found === undefined) throw new NotFoundError(`user ${id} not found`);

      const result = await setSubscription(db, id, active, { plan, days });

      return c.json({
        active: result !== undefined,
        plan: result?.plan ?? null,
        expiresAt: result?.currentPeriodEnd.toISOString() ?? null,
      } satisfies z.infer<typeof putUserSubscriptionResponseSchema>);
    }
  )
  /**
   * Moves a user's point balance by hand. A testing affordance: there is
   * no way to earn points except by answering questions, which makes any
   * balance-dependent feature (the store, guardian investment, the
   * leaderboard) tedious to exercise.
   *
   * Writes a real ledger row rather than only touching the balance, so
   * SUM(point_transaction.amount) still reconciles against
   * userTable.totalPoints -- the invariant the schema comment relies on.
   * A silent balance change would make that check useless exactly when
   * it is needed to explain a wrong number.
   *
   * Mirrors production's asymmetry rather than inventing its own: earning
   * raises totalPoints and lifetimePoints together (reply.ts), spending
   * lowers only totalPoints (store.ts), because lifetimePoints backs the
   * leaderboard and never decreases. So a +100 followed by -100 leaves
   * lifetimePoints 100 higher, which is correct, not a leak.
   */
  .put('/:id/points', requireAdmin, putPointsDoc, zValidator('json', userPointsBodySchema), async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    const { delta } = c.req.valid('json');
    console.log(`PUT /api/user/${id}/points delta=${delta}`);

    const [found] = await db.select().from(userTable).where(eq(userTable.id, id));
    if (found === undefined) throw new NotFoundError(`user ${id} not found`);

    // total_points is INT UNSIGNED, so a debit past zero is a database
    // error rather than a negative balance. Refused with the balance in
    // the message, which is what the caller needs to pick a valid delta
    // -- and not clamped to zero, because silently doing something other
    // than what was asked is worse in a tool used to set up test state.
    const newTotalPoints = found.totalPoints + delta;
    if (newTotalPoints < 0)
      throw new BadRequestError(
        `delta ${delta} would leave a negative balance (current ${found.totalPoints})`,
        'INSUFFICIENT_POINTS'
      );

    const now = new Date();
    const credit = delta > 0;
    await db
      .update(userTable)
      .set({
        totalPoints: sql`${userTable.totalPoints} + ${delta}`,
        ...(credit
          ? { lifetimePoints: sql`${userTable.lifetimePoints} + ${delta}` }
          : {}),
        updatedAt: now,
      })
      .where(eq(userTable.id, id));

    // One type for both directions: amount is signed, and the wallet
    // already renders the sign separately from the label.
    await db.insert(pointTransactionTable).values({
      userId: id,
      type: 'ADMIN_ADJUST',
      amount: delta,
      balanceAfter: newTotalPoints,
      createdAt: now,
    });

    return c.json({
      totalPoints: newTotalPoints,
      lifetimePoints: credit ? found.lifetimePoints + delta : found.lifetimePoints,
      delta,
    } satisfies z.infer<typeof putUserPointsResponseSchema>);
  })
  // The signed-in user's own profile -- unlike GET /:id below, this needs
  // no admin check since it can only ever read the caller's own row.
  .get('/me', requireUser, meDoc, async (c) => {
    const user = c.get('user');
    console.log(`GET /api/user/me userId=${user.id}`);
    return c.json(toUserDto(user) satisfies z.infer<typeof userSchema>);
  })
  // Name is the only self-editable field -- email/avatar/firebaseUid stay
  // whatever POST /sync last set them to from the Firebase identity.
  .put('/me', requireUser, putMeDoc, zValidator('json', userUpdateMeBodySchema), async (c) => {
    const user = c.get('user');
    const { name } = c.req.valid('json');
    console.log(`PUT /api/user/me userId=${user.id}`);
    const db = c.get('db');

    await db.update(userTable).set({ name, updatedAt: new Date() }).where(eq(userTable.id, user.id));
    const [updated] = await db.select().from(userTable).where(eq(userTable.id, user.id));
    return c.json(toUserDto(updated) satisfies z.infer<typeof userSchema>);
  })
  // Registered after the other static routes (/sync, /stats, /history, /me)
  // -- as a dynamic segment, this would otherwise swallow requests to any
  // of them (Hono matches routes in registration order, not by specificity).
  .get('/:id', requireAdmin, getByIdDoc, async (c) => {
    const id = c.req.param('id');
    console.log(`GET /api/user/${id}`);
    const [found] = await c
      .get('db')
      .select()
      .from(userTable)
      .where(eq(userTable.id, Number(id)));
    if (found === undefined) throw new NotFoundError(`user ${id} not found`);

    return c.json(toUserDto(found) satisfies z.infer<typeof userSchema>);
  });
