import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
import { guardianTable, pointTransactionTable, userGuardianTable, userTable } from 'src/db/schema';

vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdTokenUid: vi.fn() }));
import { verifyIdTokenUid } from 'src/lib/firebaseAdmin';

type GuardianDto = {
  id: number;
  guardianId: number;
  code: string;
  name: string;
  theme: string;
  level: number;
  xp: number;
  nextLevelXp: number | null;
};
type GetGuardianResponse = { data: GuardianDto[]; totalPoints: number };
type PostInvestResponse = { guardian: GuardianDto; totalPoints: number };
type ErrorBody = { message: string; code?: string };

const getGuardians = () => app.request('/api/guardian');

const postInvest = (id: number, body: unknown) =>
  app.request(`/api/guardian/${id}/invest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const clearTables = async () => {
  const db = getDb();
  await db.delete(pointTransactionTable);
  await db.delete(userGuardianTable);
  await db.delete(guardianTable);
  await db.delete(userTable);
};

const seedUser = async (totalPoints = 0, firebaseUid = 'fixture-uid') => {
  const db = getDb();
  const [{ insertId: userId }] = await db.insert(userTable).values({
    firebaseUid,
    email: `${firebaseUid}@example.com`,
    name: 'fixture user',
    totalPoints,
    lifetimePoints: totalPoints,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return userId;
};

const seedSpecies = async (overrides: Partial<typeof guardianTable.$inferInsert> = {}) => {
  const db = getDb();
  const [{ insertId: speciesId }] = await db.insert(guardianTable).values({
    code: 'forest',
    name: '森林之蛋',
    theme: '森林保育',
    cost: 20,
    sortOrder: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  return speciesId;
};

const seedOwnedGuardian = async (
  userId: number,
  speciesId: number,
  overrides: Partial<typeof userGuardianTable.$inferInsert> = {}
) => {
  const db = getDb();
  const now = new Date();
  const [{ insertId: userGuardianId }] = await db.insert(userGuardianTable).values({
    userId,
    guardianId: speciesId,
    level: 1,
    xp: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  return userGuardianId;
};

describe('guardian routes', () => {
  beforeAll(clearTables);

  beforeEach(() => {
    vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
  });

  afterEach(clearTables);

  afterAll(async () => {
    await closeDb();
  });

  describe('GET /', () => {
    it('rejects with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdTokenUid).mockResolvedValue(null);
      const res = await getGuardians();
      expect(res.status).toBe(401);
    });

    it("returns only the requesting user's own guardians, with nextLevelXp for the level-1 threshold", async () => {
      const userId = await seedUser(100);
      const speciesId = await seedSpecies();
      await seedOwnedGuardian(userId, speciesId);

      const otherUserId = await seedUser(0, 'other-uid');
      const otherSpeciesId = await seedSpecies({ code: 'ocean' });
      await seedOwnedGuardian(otherUserId, otherSpeciesId);

      const res = await getGuardians();
      expect(res.status).toBe(200);
      const body = (await res.json()) as GetGuardianResponse;
      expect(body.totalPoints).toBe(100);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({ guardianId: speciesId, level: 1, xp: 0, nextLevelXp: 25_000 });
    });

    it('returns nextLevelXp=null for a max-level guardian', async () => {
      const userId = await seedUser(0);
      const speciesId = await seedSpecies();
      await seedOwnedGuardian(userId, speciesId, { level: 5, xp: 0 });

      const res = await getGuardians();
      const body = (await res.json()) as GetGuardianResponse;
      expect(body.data[0].nextLevelXp).toBeNull();
    });
  });

  describe('POST /:id/invest', () => {
    it('rejects with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdTokenUid).mockResolvedValue(null);
      const res = await postInvest(1, { points: 10 });
      expect(res.status).toBe(401);
    });

    it('rejects with 404 for a guardian id that does not belong to the requesting user', async () => {
      const ownerId = await seedUser(1000, 'owner-uid');
      const speciesId = await seedSpecies();
      const userGuardianId = await seedOwnedGuardian(ownerId, speciesId);
      await seedUser(1000, 'attacker-uid');

      vi.mocked(verifyIdTokenUid).mockResolvedValue('attacker-uid');
      const res = await postInvest(userGuardianId, { points: 10 });
      expect(res.status).toBe(404);
    });

    it('adds points 1:1 to xp without leveling up when below the first threshold', async () => {
      const userId = await seedUser(1000);
      const speciesId = await seedSpecies();
      const userGuardianId = await seedOwnedGuardian(userId, speciesId);

      const res = await postInvest(userGuardianId, { points: 500 });
      expect(res.status).toBe(200);
      const body = (await res.json()) as PostInvestResponse;
      expect(body.guardian).toMatchObject({ level: 1, xp: 500, nextLevelXp: 25_000 });
      expect(body.totalPoints).toBe(500);

      const db = getDb();
      const [row] = await db.select().from(userGuardianTable).where(eq(userGuardianTable.id, userGuardianId));
      expect(row).toMatchObject({ level: 1, xp: 500 });
    });

    it('levels up and carries the xp remainder over the threshold', async () => {
      const userId = await seedUser(100_000);
      const speciesId = await seedSpecies();
      const userGuardianId = await seedOwnedGuardian(userId, speciesId);

      // 25,000 needed for Lv1->2; investing 25,500 should land at level 2
      // with 500 xp carried over.
      const res = await postInvest(userGuardianId, { points: 25_500 });
      const body = (await res.json()) as PostInvestResponse;
      expect(body.guardian).toMatchObject({ level: 2, xp: 500, nextLevelXp: 75_000 });
    });

    it('jumps multiple levels in a single large investment', async () => {
      const userId = await seedUser(1_000_000);
      const speciesId = await seedSpecies();
      const userGuardianId = await seedOwnedGuardian(userId, speciesId);

      // 25,000 + 75,000 + 100 = 100,100 -> lands at level 3 with 100 xp.
      const res = await postInvest(userGuardianId, { points: 100_100 });
      const body = (await res.json()) as PostInvestResponse;
      expect(body.guardian).toMatchObject({ level: 3, xp: 100, nextLevelXp: 225_000 });
    });

    it('reaches exactly max level with zero leftover xp when investing exactly 1,000,000', async () => {
      const userId = await seedUser(1_050_000);
      const speciesId = await seedSpecies();
      const userGuardianId = await seedOwnedGuardian(userId, speciesId);

      const res = await postInvest(userGuardianId, { points: 1_000_000 });
      const body = (await res.json()) as PostInvestResponse;
      expect(body.guardian).toMatchObject({ level: 5, xp: 0, nextLevelXp: null });
    });

    it('reaches max level and discards any xp overflow beyond the final threshold', async () => {
      const userId = await seedUser(1_500_000);
      const speciesId = await seedSpecies();
      const userGuardianId = await seedOwnedGuardian(userId, speciesId);

      // Full chain to max level is 1,000,000; investing 1,050,000 overshoots.
      const res = await postInvest(userGuardianId, { points: 1_050_000 });
      const body = (await res.json()) as PostInvestResponse;
      expect(body.guardian).toMatchObject({ level: 5, xp: 0, nextLevelXp: null });
      // Full requested amount still deducted, no partial refund for the overflow.
      expect(body.totalPoints).toBe(450_000);
    });

    it('rejects with 400 once already at max level', async () => {
      const userId = await seedUser(1000);
      const speciesId = await seedSpecies();
      const userGuardianId = await seedOwnedGuardian(userId, speciesId, { level: 5, xp: 0 });

      const res = await postInvest(userGuardianId, { points: 10 });
      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.code).toBe('ALREADY_MAX_LEVEL');
    });

    it('rejects with 400 when totalPoints is below the requested invest amount', async () => {
      const userId = await seedUser(100);
      const speciesId = await seedSpecies();
      const userGuardianId = await seedOwnedGuardian(userId, speciesId);

      const res = await postInvest(userGuardianId, { points: 500 });
      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.code).toBe('INSUFFICIENT_POINTS');
    });

    it('deducts totalPoints (not lifetimePoints) and logs a SPEND_GUARDIAN_INVEST transaction', async () => {
      const userId = await seedUser(1000);
      const speciesId = await seedSpecies();
      const userGuardianId = await seedOwnedGuardian(userId, speciesId);

      await postInvest(userGuardianId, { points: 300 });

      const db = getDb();
      const [updatedUser] = await db.select().from(userTable).where(eq(userTable.id, userId));
      expect(updatedUser.totalPoints).toBe(700);
      expect(updatedUser.lifetimePoints).toBe(1000);

      const [transaction] = await db
        .select()
        .from(pointTransactionTable)
        .where(eq(pointTransactionTable.userId, userId));
      expect(transaction).toMatchObject({ type: 'SPEND_GUARDIAN_INVEST', amount: -300, balanceAfter: 700, replyId: null });
    });
  });
});
