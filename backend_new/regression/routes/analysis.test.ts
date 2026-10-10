import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
import {
  conceptGroupTable,
  conceptTable,
  subjectTable,
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
  await db.delete(userConceptStatTable);
  await db.delete(conceptTable);
  await db.delete(conceptGroupTable);
  await db.delete(subjectTable);
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

const grantSubscription = async (userId: number) => {
  await getDb().insert(userSubscriptionTable).values({
    userId,
    plan: 'monthly',
    status: 'active',
    currentPeriodStart: daysAgo(1),
    currentPeriodEnd: daysAhead(30),
    createdAt: new Date(),
  });
};

const addConcept = async (groupId: number, name: string) => {
  const [{ insertId }] = await getDb()
    .insert(conceptTable)
    .values({ name, conceptGroupId: groupId, createdAt: new Date() });
  return insertId;
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

type RiskItem = {
  concept: string;
  subject: string;
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

      const res = await app.request('/api/analysis/forgetting-risk');
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
    });

    it('rejects with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdTokenUid).mockResolvedValue(null);
      const res = await app.request('/api/analysis/forgetting-risk');
      expect(res.status).toBe(401);
    });

    it('admits a subscriber', async () => {
      const { userId } = await seed();
      await grantSubscription(userId);
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/forgetting-risk');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/analysis/forgetting-risk', () => {
    it('ranks the least-retained concept first', async () => {
      const { userId, groupId } = await seed();
      await grantSubscription(userId);
      // Same mastery, very different recency -- so the ordering can only
      // come from the decay, not from mastery.
      await addStat(userId, await addConcept(groupId, 'stale'), { mastery: 5, days: 40 });
      await addStat(userId, await addConcept(groupId, 'fresh'), { mastery: 5, days: 1 });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/forgetting-risk');
      const body = (await res.json()) as RiskItem[];

      expect(body).toHaveLength(2);
      expect(body[0].concept).toBe('stale');
      expect(body[0].retention).toBeLessThan(body[1].retention);
      expect(body[0].level).toBe('high');
      expect(body[1].level).toBe('low');
      expect(body[0].daysSinceReview).toBe(40);
      expect(body[0].subject).toBe('數學');
    });

    // The whole point of folding mastery into the curve: the better you
    // knew something, the longer it survives without review.
    it('decays a well-known concept more slowly than a poorly-known one', async () => {
      const { userId, groupId } = await seed();
      await grantSubscription(userId);
      await addStat(userId, await addConcept(groupId, 'weak'), { mastery: 1, days: 14 });
      await addStat(userId, await addConcept(groupId, 'strong'), { mastery: 9, days: 14 });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/forgetting-risk');
      const body = (await res.json()) as RiskItem[];

      expect(body[0].concept).toBe('weak');
      expect(body[1].concept).toBe('strong');
      expect(body[1].retention).toBeGreaterThan(body[0].retention);
    });

    it('omits concepts that have never been attempted', async () => {
      const { userId, groupId } = await seed();
      await grantSubscription(userId);
      await addConcept(groupId, 'untouched');
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/forgetting-risk');
      expect(await res.json()).toEqual([]);
    });

    it('filters to one subject when asked', async () => {
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

      const res = await app.request(`/api/analysis/forgetting-risk?subjectId=${otherSubjectId}`);
      const body = (await res.json()) as RiskItem[];
      expect(body).toHaveLength(1);
      expect(body[0].concept).toBe('chinese concept');
    });

    it('caps the list at the requested limit, keeping the most urgent', async () => {
      const { userId, groupId } = await seed();
      await grantSubscription(userId);
      await addStat(userId, await addConcept(groupId, 'a'), { mastery: 5, days: 60 });
      await addStat(userId, await addConcept(groupId, 'b'), { mastery: 5, days: 30 });
      await addStat(userId, await addConcept(groupId, 'c'), { mastery: 5, days: 1 });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/forgetting-risk?limit=2');
      const body = (await res.json()) as RiskItem[];
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

      const res = await app.request('/api/analysis/forgetting-risk');
      const body = (await res.json()) as RiskItem[];
      expect(body).toHaveLength(1);
      expect(body[0].concept).toBe('mine');
    });

    it('rejects a limit beyond the allowed maximum', async () => {
      const { userId } = await seed();
      await grantSubscription(userId);
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/forgetting-risk?limit=999');
      expect(res.status).toBe(400);
    });

    // Retention is a probability, so a freshly-reviewed concept must sit
    // near 1 and never above it.
    it('reports retention near 1 for a concept reviewed today', async () => {
      const { userId, groupId } = await seed();
      await grantSubscription(userId);
      await addStat(userId, await addConcept(groupId, 'today'), { mastery: 5, days: 0 });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/analysis/forgetting-risk');
      const body = (await res.json()) as RiskItem[];
      expect(body[0].retention).toBe(1);
      expect(body[0].daysSinceReview).toBe(0);
    });
  });
});
