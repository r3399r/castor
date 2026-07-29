import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { eq } from 'drizzle-orm';
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
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
import { ADMIN_EMAILS } from 'src/middleware/adminAuth';

// The admin gate is exercised end-to-end in its own describe block below;
// every other test just needs reads to succeed, so default the mocked
// Firebase verification to the admin identity. verifyIdTokenFull backs
// POST /sync's own (non-admin) identity check; verifyIdTokenUid backs
// /stats and /history's requireUser gate.
vi.mock('src/lib/firebaseAdmin', () => ({
  verifyIdToken: vi.fn(),
  verifyIdTokenFull: vi.fn(),
  verifyIdTokenUid: vi.fn(),
}));
import { verifyIdToken, verifyIdTokenFull, verifyIdTokenUid } from 'src/lib/firebaseAdmin';

type UserDto = {
  id: number;
  firebaseUid: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  lastLoginAt: string | null;
};

const clearTable = async () => {
  const db = getDb();
  await db.delete(userConceptStatTable);
  await db.delete(userStatHistoryTable);
  await db.delete(conceptTable);
  await db.delete(conceptGroupTable);
  await db.delete(subjectCategoryTable);
  await db.delete(subjectTable);
  await db.delete(categoryTable);
  await db.delete(userTable);
};

// /stats and /history resolve the caller via requireUser (firebase_uid ->
// user row), separate from both the admin allowlist and /sync's own
// identity check -- this seeds that row.
const seedUser = async () => {
  const db = getDb();
  const [{ insertId: userId }] = await db.insert(userTable).values({
    firebaseUid: 'fixture-uid',
    email: 'fixture-user@example.com',
    name: 'fixture user',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return userId;
};

describe('user routes', () => {
  beforeAll(clearTable);

  beforeEach(() => {
    vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);
  });

  afterEach(clearTable);

  afterAll(async () => {
    await closeDb();
  });

  it('lists users, empty when there is no data', async () => {
    const res = await app.request('/api/user');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: [],
      paginate: { total: 0, page: 1, limit: 20, totalPages: 1 },
    });
  });

  it('lists a seeded user with all its columns', async () => {
    await getDb().insert(userTable).values({
      firebaseUid: 'uid-1',
      email: 'a@example.com',
      name: 'Alice',
      avatar: 'https://example.com/a.png',
      lastLoginAt: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.request('/api/user');
    const body = (await res.json()) as { data: UserDto[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      firebaseUid: 'uid-1',
      email: 'a@example.com',
      name: 'Alice',
      avatar: 'https://example.com/a.png',
    });
  });

  it('fetches a user by id', async () => {
    const [{ insertId }] = await getDb()
      .insert(userTable)
      .values({ firebaseUid: 'uid-2', email: 'b@example.com', name: 'Bob' });

    const res = await app.request(`/api/user/${insertId}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ email: 'b@example.com', name: 'Bob' });
  });

  it('404s for an unknown user id', async () => {
    const res = await app.request('/api/user/999999');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      status: 404,
      name: 'NotFoundError',
      code: 'NOT_FOUND',
    });
  });

  describe('pagination and sorting', () => {
    it('paginates with limit/offset and reports page metadata', async () => {
      await getDb()
        .insert(userTable)
        .values([
          { firebaseUid: 'uid-c', name: 'c-charlie' },
          { firebaseUid: 'uid-a', name: 'a-alpha' },
          { firebaseUid: 'uid-b', name: 'b-bravo' },
        ]);

      const res = await app.request('/api/user?limit=2&offset=0');
      const body = (await res.json()) as {
        data: UserDto[];
        paginate: { total: number; page: number; limit: number; totalPages: number };
      };
      expect(body.data).toHaveLength(2);
      expect(body.paginate).toEqual({
        total: 3,
        page: 1,
        limit: 2,
        totalPages: 2,
      });

      const page2 = await app.request('/api/user?limit=2&offset=2');
      const page2Body = (await page2.json()) as { data: UserDto[] };
      expect(page2Body.data).toHaveLength(1);
    });

    it('sorts by name ascending and descending', async () => {
      await getDb()
        .insert(userTable)
        .values([
          { firebaseUid: 'uid-c', name: 'c-charlie' },
          { firebaseUid: 'uid-a', name: 'a-alpha' },
          { firebaseUid: 'uid-b', name: 'b-bravo' },
        ]);

      const ascRes = await app.request('/api/user?sort=name&order=asc');
      const ascBody = (await ascRes.json()) as { data: UserDto[] };
      expect(ascBody.data.map((u) => u.name)).toEqual([
        'a-alpha',
        'b-bravo',
        'c-charlie',
      ]);

      const descRes = await app.request('/api/user?sort=name&order=desc');
      const descBody = (await descRes.json()) as { data: UserDto[] };
      expect(descBody.data.map((u) => u.name)).toEqual([
        'c-charlie',
        'b-bravo',
        'a-alpha',
      ]);
    });

    it('rejects an out-of-range limit with 400', async () => {
      const res = await app.request('/api/user?limit=99999');
      expect(res.status).toBe(400);
    });

    it('rejects an invalid sort column with 400', async () => {
      const res = await app.request('/api/user?sort=bogus');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /sync', () => {
    const postSync = () => app.request('/api/user/sync', { method: 'POST' });

    it('rejects with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdTokenFull).mockResolvedValue(null);
      const res = await postSync();
      expect(res.status).toBe(401);
    });

    it('creates a new user row on first sign-in', async () => {
      vi.mocked(verifyIdTokenFull).mockResolvedValue({
        uid: 'new-uid',
        email: 'new@example.com',
        name: 'New User',
        picture: 'https://example.com/new.png',
      });

      const res = await postSync();
      expect(res.status).toBe(201);
      const body = (await res.json()) as UserDto;
      expect(body).toMatchObject({
        firebaseUid: 'new-uid',
        email: 'new@example.com',
        name: 'New User',
        avatar: 'https://example.com/new.png',
      });
      expect(body.lastLoginAt).toEqual(expect.any(String));

      const rows = await getDb().select().from(userTable).where(eq(userTable.firebaseUid, 'new-uid'));
      expect(rows).toHaveLength(1);
    });

    it('succeeds for a non-admin identity -- /sync is not gated by the admin allowlist', async () => {
      vi.mocked(verifyIdTokenFull).mockResolvedValue({
        uid: 'ordinary-uid',
        email: 'ordinary@example.com',
        name: 'Ordinary User',
        picture: null,
      });

      const res = await postSync();
      expect(res.status).toBe(201);
    });

    it('refreshes only lastLoginAt for a returning user, leaving other fields untouched', async () => {
      const [{ insertId }] = await getDb().insert(userTable).values({
        firebaseUid: 'returning-uid',
        email: 'original@example.com',
        name: 'Original Name',
        avatar: 'https://example.com/original.png',
        lastLoginAt: new Date('2020-01-01T00:00:00Z'),
        createdAt: new Date('2020-01-01T00:00:00Z'),
        updatedAt: new Date('2020-01-01T00:00:00Z'),
      });
      // Firebase-side profile changed since the row was created -- sync
      // should not overwrite the stored name/email/avatar with these.
      vi.mocked(verifyIdTokenFull).mockResolvedValue({
        uid: 'returning-uid',
        email: 'changed@example.com',
        name: 'Changed Name',
        picture: 'https://example.com/changed.png',
      });

      const res = await postSync();
      expect(res.status).toBe(200);
      const body = (await res.json()) as UserDto;
      expect(body).toMatchObject({
        id: insertId,
        email: 'original@example.com',
        name: 'Original Name',
        avatar: 'https://example.com/original.png',
      });
      expect(new Date(body.lastLoginAt!).getTime()).toBeGreaterThan(new Date('2020-01-01T00:00:00Z').getTime());

      const rows = await getDb().select().from(userTable).where(eq(userTable.firebaseUid, 'returning-uid'));
      expect(rows).toHaveLength(1);
    });
  });

  describe('GET /stats', () => {
    it('rejects with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdTokenUid).mockResolvedValue(null);
      const res = await app.request('/api/user/stats');
      expect(res.status).toBe(401);
    });

    it('returns an empty array when the user has no concept stats', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');

      const res = await app.request('/api/user/stats');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it('computes weighted mastery per concept group and includes untouched groups at mastery 0', async () => {
      const userId = await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const db = getDb();

      const [{ insertId: categoryId }] = await db.insert(categoryTable).values({ name: 'fixture category', createdAt: new Date() });
      const [{ insertId: subjectId }] = await db.insert(subjectTable).values({ name: 'fixture subject', createdAt: new Date() });
      await db.insert(subjectCategoryTable).values({ subjectId, categoryId });
      const [{ insertId: groupA }] = await db.insert(conceptGroupTable).values({ name: 'group a', subjectId, createdAt: new Date() });
      const [{ insertId: groupB }] = await db.insert(conceptGroupTable).values({ name: 'group b', subjectId, createdAt: new Date() });
      const [{ insertId: concept1 }] = await db.insert(conceptTable).values({ name: 'c1', conceptGroupId: groupA, numberOfQuestions: 3, createdAt: new Date() });
      const [{ insertId: concept2 }] = await db.insert(conceptTable).values({ name: 'c2', conceptGroupId: groupA, numberOfQuestions: 1, createdAt: new Date() });
      await db.insert(conceptTable).values({ name: 'c3', conceptGroupId: groupB, numberOfQuestions: 2, createdAt: new Date() });
      await db.insert(userConceptStatTable).values([
        { userId, conceptId: concept1, mastery: 6, createdAt: new Date(), updatedAt: new Date() },
        { userId, conceptId: concept2, mastery: 2, createdAt: new Date(), updatedAt: new Date() },
      ]);

      const res = await app.request('/api/user/stats');
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        id: number;
        name: string;
        category: { id: number; name: string }[];
        conceptGroup: { id: number; name: string; mastery: number; numberOfQuestions: number }[];
      }[];
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({ id: subjectId, name: 'fixture subject' });
      expect(body[0].category).toEqual([{ id: categoryId, name: 'fixture category' }]);
      const cgA = body[0].conceptGroup.find((g) => g.id === groupA)!;
      const cgB = body[0].conceptGroup.find((g) => g.id === groupB)!;
      // (6*3 + 2*1) / (3+1) = 5
      expect(cgA).toMatchObject({ name: 'group a', mastery: 5, numberOfQuestions: 4 });
      expect(cgB).toMatchObject({ name: 'group b', mastery: 0, numberOfQuestions: 2 });
    });
  });

  describe('GET /history', () => {
    const dateNDaysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    it('rejects with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdTokenUid).mockResolvedValue(null);
      const res = await app.request('/api/user/history');
      expect(res.status).toBe(401);
    });

    it('returns zero-value defaults when the user has no history rows', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');

      const res = await app.request('/api/user/history');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        totalAttempts: 0,
        overallAccuracy: 0,
        streakDays: 0,
        overallDailyMastery: [],
        subjectHistory: [],
        activityMap: [],
      });
    });

    it('aggregates attempts/accuracy, computes a 2-day streak, and reports per-day activity', async () => {
      const userId = await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const db = getDb();
      const [{ insertId: subjectId }] = await db.insert(subjectTable).values({ name: 'fixture subject', createdAt: new Date() });
      const [{ insertId: groupId }] = await db.insert(conceptGroupTable).values({ name: 'group', subjectId, createdAt: new Date() });
      await db.insert(conceptTable).values({ name: 'concept', conceptGroupId: groupId, numberOfQuestions: 5, createdAt: new Date() });

      const yesterday = dateNDaysAgo(1);
      const today = dateNDaysAgo(0);
      await db.insert(userStatHistoryTable).values([
        { userId, subjectId, date: yesterday, weightedMastery: 4, dailyAttempts: 2, dailyCorrect: 10, createdAt: new Date(), updatedAt: new Date() },
        { userId, subjectId, date: today, weightedMastery: 6, dailyAttempts: 3, dailyCorrect: 20, createdAt: new Date(), updatedAt: new Date() },
      ]);

      const res = await app.request('/api/user/history');
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        totalAttempts: number;
        overallAccuracy: number;
        streakDays: number;
        overallDailyMastery: { date: string; weightedMastery: number }[];
        subjectHistory: { subjectId: number; subjectName: string; dailyStats: { date: string; weightedMastery: number }[] }[];
        activityMap: { date: string; count: number }[];
      };
      expect(body.totalAttempts).toBe(5);
      // (10 + 20) / 5 / 10 * 100 = 60
      expect(body.overallAccuracy).toBeCloseTo(60, 10);
      expect(body.streakDays).toBe(2);
      expect(body.overallDailyMastery.map((d) => d.date)).toEqual([yesterday, today]);
      expect(body.overallDailyMastery.map((d) => d.weightedMastery)).toEqual([4, 6]);
      expect(body.activityMap).toEqual([
        { date: yesterday, count: 2 },
        { date: today, count: 3 },
      ]);
      expect(body.subjectHistory).toHaveLength(1);
      expect(body.subjectHistory[0]).toMatchObject({ subjectId, subjectName: 'fixture subject' });
      expect(body.subjectHistory[0].dailyStats.map((d) => d.weightedMastery)).toEqual([4, 6]);
    });

    it('carries the last known mastery forward across gap days with no activity', async () => {
      const userId = await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const db = getDb();
      const [{ insertId: subjectId }] = await db.insert(subjectTable).values({ name: 'gap subject', createdAt: new Date() });
      const [{ insertId: groupId }] = await db.insert(conceptGroupTable).values({ name: 'group', subjectId, createdAt: new Date() });
      await db.insert(conceptTable).values({ name: 'concept', conceptGroupId: groupId, numberOfQuestions: 5, createdAt: new Date() });

      const threeDaysAgo = dateNDaysAgo(3);
      const today = dateNDaysAgo(0);
      await db.insert(userStatHistoryTable).values([
        { userId, subjectId, date: threeDaysAgo, weightedMastery: 4, dailyAttempts: 1, dailyCorrect: 5, createdAt: new Date(), updatedAt: new Date() },
        { userId, subjectId, date: today, weightedMastery: 8, dailyAttempts: 1, dailyCorrect: 9, createdAt: new Date(), updatedAt: new Date() },
      ]);

      const res = await app.request('/api/user/history');
      const body = (await res.json()) as {
        streakDays: number;
        overallDailyMastery: { date: string; weightedMastery: number }[];
      };
      // Not consecutive with today (a 2-day gap in between) -- streak
      // still counts today itself, just doesn't extend past it.
      expect(body.streakDays).toBe(1);
      expect(body.overallDailyMastery).toHaveLength(4);
      expect(body.overallDailyMastery.map((d) => d.date)).toEqual([
        threeDaysAgo,
        dateNDaysAgo(2),
        dateNDaysAgo(1),
        today,
      ]);
      // carried forward on the two gap days
      expect(body.overallDailyMastery.map((d) => d.weightedMastery)).toEqual([4, 4, 4, 8]);
    });

    it('reports a streak of 0 when the most recent activity is older than yesterday', async () => {
      const userId = await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const db = getDb();
      const [{ insertId: subjectId }] = await db.insert(subjectTable).values({ name: 'stale subject', createdAt: new Date() });
      await db.insert(userStatHistoryTable).values({
        userId,
        subjectId,
        date: dateNDaysAgo(3),
        weightedMastery: 5,
        dailyAttempts: 1,
        dailyCorrect: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.request('/api/user/history');
      const body = (await res.json()) as { streakDays: number };
      expect(body.streakDays).toBe(0);
    });
  });

  describe('admin auth gate', () => {
    it('rejects a GET with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await app.request('/api/user');
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({
        status: 401,
        name: 'UnauthorizedError',
        code: 'UNAUTHORIZED',
      });
    });

    it('rejects a GET with 403 for a non-admin email', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue('someone-else@example.com');

      const res = await app.request('/api/user');
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({
        status: 403,
        name: 'ForbiddenError',
        code: 'FORBIDDEN',
      });
    });
  });
});
