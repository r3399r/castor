import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
import {
  categoryTable,
  conceptGroupTable,
  conceptTable,
  questionTable,
  replyTable,
  subjectCategoryTable,
  subjectTable,
  userStatHistoryTable,
  userConceptStatTable,
  userSubscriptionTable,
  userTable,
} from 'src/db/schema';

vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdToken: vi.fn(), verifyIdTokenUid: vi.fn() }));
import { verifyIdTokenUid } from 'src/lib/firebaseAdmin';

const FIXTURE_UID = 'analysis-fixture-uid';
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);
const daysAhead = (days: number) => new Date(Date.now() + days * DAY_MS);

const clearTables = async () => {
  const db = getDb();
  await db.delete(userSubscriptionTable);
  await db.delete(replyTable);
  await db.delete(questionTable);
  await db.delete(userStatHistoryTable);
  await db.delete(userConceptStatTable);
  await db.delete(conceptTable);
  await db.delete(conceptGroupTable);
  // Before subject: subject_category holds a foreign key to it.
  await db.delete(subjectCategoryTable);
  await db.delete(subjectTable);
  await db.delete(categoryTable);
  await db.delete(userTable);
};

const seed = async () => {
  const db = getDb();
  const [{ insertId: userId }] = await db
    .insert(userTable)
    .values({ firebaseUid: FIXTURE_UID, email: `${FIXTURE_UID}@example.com`, createdAt: new Date() });
  const [{ insertId: subjectId }] = await db
    .insert(subjectTable)
    .values({ name: '數學', createdAt: new Date() });
  const [{ insertId: groupId }] = await db
    .insert(conceptGroupTable)
    .values({ name: 'fixture group', subjectId, createdAt: new Date() });
  return { userId, subjectId, groupId };
};

const grantSubscription = async (userId: number, status = 'active') => {
  await getDb().insert(userSubscriptionTable).values({
    userId,
    plan: 'monthly',
    status,
    currentPeriodStart: daysAgo(1),
    currentPeriodEnd: daysAhead(30),
    createdAt: new Date(),
  });
};

/** subject_category is many-to-many, so a subject can take several. */
const fileUnderCategory = async (subjectId: number, name: string) => {
  const [{ insertId: categoryId }] = await getDb()
    .insert(categoryTable)
    .values({ name, createdAt: new Date() });
  await getDb().insert(subjectCategoryTable).values({ subjectId, categoryId });
  return categoryId;
};

const addConcept = async (groupId: number, name: string) => {
  const [{ insertId }] = await getDb()
    .insert(conceptTable)
    .values({ name, conceptGroupId: groupId, createdAt: new Date() });
  return insertId;
};

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

/** reply.question_id is a real foreign key, so replies need a question. */
const addQuestion = async (subjectId: number) => {
  const [{ insertId }] = await getDb().insert(questionTable).values({
    uuid: `speed-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    subjectId,
    type: 'SINGLE',
    difficulty: 5,
    adjustedDifficulty: 5,
    createdAt: new Date(),
  });
  return insertId;
};

/** The speed endpoint finds a user's subjects through user_stat_history. */
const addActivity = async (userId: number, subjectId: number) => {
  await getDb().insert(userStatHistoryTable).values({
    userId,
    subjectId,
    date: dateOnly(new Date()),
    weightedMastery: 5,
    dailyAttempts: 1,
    createdAt: new Date(),
  });
};

const addReplies = async (
  userId: number,
  subjectId: number,
  questionId: number,
  rows: { durationMs: number; score?: number; tooFast?: boolean; daysOld?: number }[]
) => {
  await getDb()
    .insert(replyTable)
    .values(
      rows.map((r) => {
        const at = daysAgo(r.daysOld ?? 0);
        return {
          questionId,
          subjectId,
          userId,
          score: r.score ?? 10,
          durationMs: r.durationMs,
          tooFast: r.tooFast ?? false,
          repliedAt: at,
          createdAt: at,
        };
      })
    );
};

const addStat = async (
  userId: number,
  conceptId: number,
  { mastery, days }: { mastery: number; days: number }
) => {
  await getDb().insert(userConceptStatTable).values({
    userId,
    conceptId,
    mastery,
    attemptCount: 10,
    lastAttemptAt: daysAgo(days),
    createdAt: new Date(),
  });
};

type ProgressPoint = { date: string; weightedMastery: number };
type Overview = {
  progress: { overall: ProgressPoint[]; subjects: { subjectName: string; dailyStats: ProgressPoint[] }[] };
  forgettingRisk: RiskItem[];
  speed: SpeedItem[];
};

type SpeedItem = {
  subject: string;
  categories: string[];
  userMedianMs: number;
  platformMedianMs: number | null;
  deltaMs: number | null;
  accuracy: number;
  sampleCount: number;
};

type RiskItem = {
  concept: string;
  subject: string;
  categories: string[];
  retention: number;
  level: string;
  daysSinceReview: number;
  mastery: number;
};

describe('analysis', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await clearTables();
  });

  afterAll(async () => {
    await clearTables();
    await closeDb();
  });

  describe('subscription gate', () => {
    it('rejects with 403 SUBSCRIPTION_REQUIRED without a subscription', async () => {
      await seed();
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
    });

    it('rejects with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdTokenUid).mockResolvedValue(null);
      const res = await app.request('/api/analysis/overview');
      expect(res.status).toBe(401);
    });

    it('admits a subscriber', async () => {
      const { userId } = await seed();
      await grantSubscription(userId);
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      expect(res.status).toBe(200);
    });

    it('admits a cancelled subscriber until the current period ends', async () => {
      const { userId } = await seed();
      await grantSubscription(userId, 'cancelled');
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/analysis/overview -- forgettingRisk', () => {
    it('ranks the least-retained concept first', async () => {
      const { userId, groupId } = await seed();
      await grantSubscription(userId);
      // Same mastery, very different recency -- so the ordering can only
      // come from the decay, not from mastery.
      await addStat(userId, await addConcept(groupId, 'stale'), { mastery: 5, days: 40 });
      await addStat(userId, await addConcept(groupId, 'fresh'), { mastery: 5, days: 1 });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      const body = ((await res.json()) as Overview).forgettingRisk;

      expect(body).toHaveLength(2);
      expect(body[0].concept).toBe('stale');
      expect(body[0].retention).toBeLessThan(body[1].retention);
      expect(body[0].level).toBe('high');
      expect(body[1].level).toBe('low');
      expect(body[0].daysSinceReview).toBe(40);
      expect(body[0].subject).toBe('數學');
    });

    // Subject names are not unique, so the category is what tells two
    // 數學 apart on screen.
    it('reports the categories a concept\u2019s subject belongs to', async () => {
      const { userId, groupId, subjectId } = await seed();
      await grantSubscription(userId);
      await fileUnderCategory(subjectId, '\u5b78\u6e2c');
      await addStat(userId, await addConcept(groupId, 'c'), { mastery: 5, days: 10 });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      const body = ((await res.json()) as Overview).forgettingRisk;

      expect(body).toHaveLength(1);
      expect(body[0].categories).toEqual(['\u5b78\u6e2c']);
    });

    // subject_category is many-to-many. Joining it onto the main query
    // would return one row per pair and so list the concept twice --
    // which in a list sliced to the worst N also costs another concept
    // its slot.
    it('does not duplicate a concept whose subject has several categories', async () => {
      const { userId, groupId, subjectId } = await seed();
      await grantSubscription(userId);
      await fileUnderCategory(subjectId, '\u6307\u8003');
      await fileUnderCategory(subjectId, '\u5b78\u6e2c');
      await addStat(userId, await addConcept(groupId, 'c'), { mastery: 5, days: 10 });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      const body = ((await res.json()) as Overview).forgettingRisk;

      expect(body).toHaveLength(1);
      // Name-sorted, so the label does not reshuffle between requests.
      expect(body[0].categories).toEqual(['\u5b78\u6e2c', '\u6307\u8003']);
    });

    // An innerJoin onto subject_category would have dropped this row
    // entirely rather than returning it with no category.
    it('still lists a concept whose subject has no category', async () => {
      const { userId, groupId } = await seed();
      await grantSubscription(userId);
      await addStat(userId, await addConcept(groupId, 'c'), { mastery: 5, days: 10 });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      const body = ((await res.json()) as Overview).forgettingRisk;

      expect(body).toHaveLength(1);
      expect(body[0].categories).toEqual([]);
    });

    // The whole point of folding mastery into the curve: the better you
    // knew something, the longer it survives without review.
    it('decays a well-known concept more slowly than a poorly-known one', async () => {
      const { userId, groupId } = await seed();
      await grantSubscription(userId);
      await addStat(userId, await addConcept(groupId, 'weak'), { mastery: 1, days: 14 });
      await addStat(userId, await addConcept(groupId, 'strong'), { mastery: 9, days: 14 });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      const body = ((await res.json()) as Overview).forgettingRisk;

      expect(body[0].concept).toBe('weak');
      expect(body[1].concept).toBe('strong');
      expect(body[1].retention).toBeGreaterThan(body[0].retention);
    });

    it('omits concepts that have never been attempted', async () => {
      const { userId, groupId } = await seed();
      await grantSubscription(userId);
      await addConcept(groupId, 'untouched');
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      expect(((await res.json()) as Overview).forgettingRisk).toEqual([]);
    });

    // subjectId filtering went when the two endpoints merged -- nothing
    // used it, and applying it to only one half of the response would
    // have been incoherent. What matters now is that every subject the
    // user studies is represented.
    it('covers concepts across every subject the user studies', async () => {
      const db = getDb();
      const { userId, groupId } = await seed();
      await grantSubscription(userId);
      const [{ insertId: otherSubjectId }] = await db
        .insert(subjectTable)
        .values({ name: '國文', createdAt: new Date() });
      const [{ insertId: otherGroupId }] = await db
        .insert(conceptGroupTable)
        .values({ name: 'other group', subjectId: otherSubjectId, createdAt: new Date() });

      await addStat(userId, await addConcept(groupId, 'math concept'), { mastery: 5, days: 10 });
      await addStat(userId, await addConcept(otherGroupId, 'chinese concept'), { mastery: 5, days: 10 });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      const body = ((await res.json()) as Overview).forgettingRisk;
      expect(body).toHaveLength(2);
      expect(body.map((r) => r.subject).sort()).toEqual(['國文', '數學']);
    });

    it('caps the list at the requested limit, keeping the most urgent', async () => {
      const { userId, groupId } = await seed();
      await grantSubscription(userId);
      await addStat(userId, await addConcept(groupId, 'a'), { mastery: 5, days: 60 });
      await addStat(userId, await addConcept(groupId, 'b'), { mastery: 5, days: 30 });
      await addStat(userId, await addConcept(groupId, 'c'), { mastery: 5, days: 1 });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview?riskLimit=2');
      const body = ((await res.json()) as Overview).forgettingRisk;
      expect(body.map((r) => r.concept)).toEqual(['a', 'b']);
    });

    it('does not leak another user\'s concepts', async () => {
      const db = getDb();
      const { userId, groupId } = await seed();
      await grantSubscription(userId);
      const [{ insertId: otherUserId }] = await db
        .insert(userTable)
        .values({ firebaseUid: 'other-uid', email: 'other@example.com', createdAt: new Date() });
      await addStat(userId, await addConcept(groupId, 'mine'), { mastery: 5, days: 10 });
      await addStat(otherUserId, await addConcept(groupId, 'theirs'), { mastery: 5, days: 50 });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      const body = ((await res.json()) as Overview).forgettingRisk;
      expect(body).toHaveLength(1);
      expect(body[0].concept).toBe('mine');
    });

    it('rejects a limit beyond the allowed maximum', async () => {
      const { userId } = await seed();
      await grantSubscription(userId);
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview?riskLimit=999');
      expect(res.status).toBe(400);
    });

    // Retention is a probability, so a freshly-reviewed concept must sit
    // near 1 and never above it.
    it('reports retention near 1 for a concept reviewed today', async () => {
      const { userId, groupId } = await seed();
      await grantSubscription(userId);
      await addStat(userId, await addConcept(groupId, 'today'), { mastery: 5, days: 0 });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      const body = ((await res.json()) as Overview).forgettingRisk;
      expect(body[0].retention).toBe(1);
      expect(body[0].daysSinceReview).toBe(0);
    });
  });

  describe('GET /api/analysis/overview -- speed', () => {
    const setupSpeedUser = async () => {
      const { userId, subjectId } = await seed();
      await grantSubscription(userId);
      await getDb()
        .update(subjectTable)
        .set({ durationMedianMs: 60_000 })
        .where(eq(subjectTable.id, subjectId));
      await addActivity(userId, subjectId);
      const questionId = await addQuestion(subjectId);
      return { userId, subjectId, questionId };
    };

    it('rejects without a subscription', async () => {
      await seed();
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      expect(res.status).toBe(403);
    });

    // Same two hazards as the risk list: many-to-many must not duplicate
    // the row, and a subject with no category must still be listed.
    it('reports the subject categories without duplicating the row', async () => {
      const { userId, subjectId, questionId } = await setupSpeedUser();
      await fileUnderCategory(subjectId, '指考');
      await fileUnderCategory(subjectId, '學測');
      await addReplies(userId, subjectId, questionId, [
        { durationMs: 70_000 },
        { durationMs: 80_000 },
        { durationMs: 90_000 },
        { durationMs: 100_000 },
        { durationMs: 110_000 },
      ]);
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      const body = ((await res.json()) as Overview).speed;

      expect(body).toHaveLength(1);
      expect(body[0].subject).toBe('數學');
      expect(body[0].categories).toEqual(['學測', '指考']);
    });

    it('returns an empty category list for an uncategorised subject', async () => {
      const { userId, subjectId, questionId } = await setupSpeedUser();
      await addReplies(userId, subjectId, questionId, [{ durationMs: 70_000 }]);
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      const body = ((await res.json()) as Overview).speed;

      expect(body).toHaveLength(1);
      expect(body[0].categories).toEqual([]);
    });

    it('compares the user median against the subject median', async () => {
      const { userId, subjectId, questionId } = await setupSpeedUser();
      await addReplies(userId, subjectId, questionId, [
        { durationMs: 70_000 },
        { durationMs: 80_000 },
        { durationMs: 90_000 },
        { durationMs: 100_000 },
        { durationMs: 110_000 },
      ]);
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      expect(res.status).toBe(200);
      const body = ((await res.json()) as Overview).speed;

      expect(body).toHaveLength(1);
      expect(body[0].userMedianMs).toBe(90_000);
      expect(body[0].platformMedianMs).toBe(60_000);
      expect(body[0].deltaMs).toBe(30_000);
      expect(body[0].sampleCount).toBe(5);
      expect(body[0].accuracy).toBe(100);
    });

    // Excluded on the platform side too, so including them here would be
    // comparing two different populations.
    it('ignores too-fast replies', async () => {
      const { userId, subjectId, questionId } = await setupSpeedUser();
      await addReplies(userId, subjectId, questionId, [
        { durationMs: 70_000 },
        { durationMs: 80_000 },
        { durationMs: 90_000 },
        { durationMs: 100_000 },
        { durationMs: 110_000 },
        { durationMs: 10, tooFast: true, score: 0 },
      ]);
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      const body = ((await res.json()) as Overview).speed;
      expect(body[0].sampleCount).toBe(5);
      expect(body[0].userMedianMs).toBe(90_000);
    });

    it('withholds the comparison when the user has too few timed answers', async () => {
      const { userId, subjectId, questionId } = await setupSpeedUser();
      await addReplies(userId, subjectId, questionId, [
        { durationMs: 70_000 },
        { durationMs: 90_000 },
      ]);
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      const body = ((await res.json()) as Overview).speed;
      // The user's own median is still reported -- only the comparison
      // is withheld.
      expect(body[0].userMedianMs).toBe(80_000);
      expect(body[0].sampleCount).toBe(2);
      expect(body[0].deltaMs).toBeNull();
    });

    it('withholds the comparison when the subject has no platform median', async () => {
      const { userId, subjectId, questionId } = await setupSpeedUser();
      await getDb()
        .update(subjectTable)
        .set({ durationMedianMs: null })
        .where(eq(subjectTable.id, subjectId));
      await addReplies(userId, subjectId, questionId, [
        { durationMs: 70_000 },
        { durationMs: 80_000 },
        { durationMs: 90_000 },
        { durationMs: 100_000 },
        { durationMs: 110_000 },
      ]);
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      const body = ((await res.json()) as Overview).speed;
      expect(body[0].platformMedianMs).toBeNull();
      expect(body[0].deltaMs).toBeNull();
    });

    it('honours the days window', async () => {
      const { userId, subjectId, questionId } = await setupSpeedUser();
      await addReplies(userId, subjectId, questionId, [
        { durationMs: 70_000 },
        { durationMs: 80_000 },
        { durationMs: 90_000 },
        { durationMs: 100_000 },
        { durationMs: 110_000 },
        { durationMs: 999_000, daysOld: 200 },
      ]);
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview?speedDays=30');
      const body = ((await res.json()) as Overview).speed;
      expect(body[0].sampleCount).toBe(5);
    });

    it('reports a faster-than-median user with a negative delta', async () => {
      const { userId, subjectId, questionId } = await setupSpeedUser();
      await addReplies(userId, subjectId, questionId, [
        { durationMs: 20_000 },
        { durationMs: 25_000 },
        { durationMs: 30_000 },
        { durationMs: 35_000 },
        { durationMs: 40_000 },
      ]);
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      const body = ((await res.json()) as Overview).speed;
      expect(body[0].deltaMs).toBe(-30_000);
    });

    it('returns an empty list for a user with no recorded activity', async () => {
      const { userId } = await seed();
      await grantSubscription(userId);
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      expect(((await res.json()) as Overview).forgettingRisk).toEqual([]);
    });

    it('rejects a window beyond the allowed maximum', async () => {
      const { userId } = await seed();
      await grantSubscription(userId);
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview?speedDays=9999');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/analysis/overview -- progress', () => {
    const seedProgress = async () => {
      const db = getDb();
      const { userId, subjectId, groupId } = await seed();
      await grantSubscription(userId);
      await db
        .insert(conceptTable)
        .values({ name: 'c', conceptGroupId: groupId, numberOfQuestions: 10, createdAt: new Date() });
      return { userId, subjectId };
    };

    it('returns an empty series for a user with no history', async () => {
      const { userId } = await seed();
      await grantSubscription(userId);
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      const body = (await res.json()) as Overview;
      expect(body.progress).toEqual({ overall: [], subjects: [] });
    });

    it('returns the overall curve and the per-subject split', async () => {
      const { userId, subjectId } = await seedProgress();
      await getDb()
        .insert(userStatHistoryTable)
        .values([
          { userId, subjectId, date: dateOnly(daysAgo(1)), weightedMastery: 4, dailyAttempts: 2, createdAt: new Date() },
          { userId, subjectId, date: dateOnly(new Date()), weightedMastery: 6, dailyAttempts: 3, createdAt: new Date() },
        ]);
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      const body = (await res.json()) as Overview;

      expect(body.progress.overall.map((d) => d.weightedMastery)).toEqual([4, 6]);
      expect(body.progress.subjects).toHaveLength(1);
      expect(body.progress.subjects[0].subjectName).toBe('數學');
      expect(body.progress.subjects[0].dailyStats.map((d) => d.weightedMastery)).toEqual([4, 6]);
    });

    // What makes a sparse history render as a continuous line instead of
    // one that drops to zero on rest days.
    it('carries the last known mastery forward across days with no activity', async () => {
      const { userId, subjectId } = await seedProgress();
      await getDb()
        .insert(userStatHistoryTable)
        .values([
          { userId, subjectId, date: dateOnly(daysAgo(3)), weightedMastery: 4, dailyAttempts: 1, createdAt: new Date() },
          { userId, subjectId, date: dateOnly(new Date()), weightedMastery: 8, dailyAttempts: 1, createdAt: new Date() },
        ]);
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      const body = (await res.json()) as Overview;

      expect(body.progress.overall.map((d) => d.date)).toEqual([
        dateOnly(daysAgo(3)),
        dateOnly(daysAgo(2)),
        dateOnly(daysAgo(1)),
        dateOnly(new Date()),
      ]);
      expect(body.progress.overall.map((d) => d.weightedMastery)).toEqual([4, 4, 4, 8]);
    });

    it('caps the series at progressDays, keeping the most recent days', async () => {
      const { userId, subjectId } = await seedProgress();
      await getDb()
        .insert(userStatHistoryTable)
        .values([
          { userId, subjectId, date: dateOnly(daysAgo(10)), weightedMastery: 3, dailyAttempts: 1, createdAt: new Date() },
          { userId, subjectId, date: dateOnly(new Date()), weightedMastery: 9, dailyAttempts: 1, createdAt: new Date() },
        ]);
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview?progressDays=3');
      const body = (await res.json()) as Overview;

      expect(body.progress.overall).toHaveLength(3);
      expect(body.progress.overall.at(-1)?.date).toBe(dateOnly(new Date()));
      // The window opens on a carried-forward value, not on zero: the
      // series is built in full and then sliced, so history older than
      // the window still sets the starting level.
      expect(body.progress.overall[0].weightedMastery).toBe(3);
      expect(body.progress.overall.at(-1)?.weightedMastery).toBe(9);
    });

    it('is refused without a subscription', async () => {
      const { userId, subjectId } = await seed();
      await getDb().insert(userStatHistoryTable).values({
        userId,
        subjectId,
        date: dateOnly(new Date()),
        weightedMastery: 7,
        dailyAttempts: 1,
        createdAt: new Date(),
      });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/overview');
      expect(res.status).toBe(403);
    });
  });
});
