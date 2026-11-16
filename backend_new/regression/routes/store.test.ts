import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
import {
  guardianTable,
  pointTransactionTable,
  userGuardianTable,
  userSubscriptionTable,
  userTable,
} from 'src/db/schema';
import { VIP_GUARDIAN_CODE } from 'src/lib/guardianLevel';

vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdTokenUid: vi.fn() }));
import { verifyIdTokenUid } from 'src/lib/firebaseAdmin';
import {
  getStoreSpeciesResponseSchema,
  postStoreRedeemResponseSchema,
} from 'src/routes/store';

type GuardianSpeciesDto = { id: number; code: string; name: string; theme: string; cost: number; owned: boolean; level: number | null };
type GetStoreSpeciesResponse = { data: GuardianSpeciesDto[]; totalPoints: number };
type PostRedeemResponse = { guardian: { id: number; speciesId: number; level: number; xp: number }; totalPoints: number };
type ErrorBody = { message: string; code?: string };

const getSpecies = () => app.request('/api/store/species');

const postRedeem = (body: unknown) =>
  app.request('/api/store/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const clearTables = async () => {
  const db = getDb();
  await db.delete(pointTransactionTable);
  await db.delete(userGuardianTable);
  await db.delete(guardianTable);
  await db.delete(userSubscriptionTable);
  await db.delete(userTable);
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A subscription period granting paid access right now. `cancelled` is
 * deliberately still entitled -- the period already paid for runs to its
 * end -- which is the case the VIP gate must not reject.
 */
const seedSubscription = async (userId: number, status = 'active', endsInDays = 30) => {
  const db = getDb();
  const now = new Date();
  await db.insert(userSubscriptionTable).values({
    userId,
    plan: 'monthly',
    status,
    currentPeriodStart: new Date(now.getTime() - DAY_MS),
    currentPeriodEnd: new Date(now.getTime() + endsInDays * DAY_MS),
    provider: 'ecpay',
    providerRef: `fixture-${userId}-${status}`,
    createdAt: now,
    updatedAt: now,
  });
};

const seedUser = async (totalPoints = 0) => {
  const db = getDb();
  const [{ insertId: userId }] = await db.insert(userTable).values({
    firebaseUid: 'fixture-uid',
    email: 'fixture-user@example.com',
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

describe('store routes', () => {
  beforeAll(clearTables);

  beforeEach(() => {
    vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
  });

  afterEach(clearTables);

  afterAll(async () => {
    await closeDb();
  });

  describe('GET /species', () => {
    it('rejects with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdTokenUid).mockResolvedValue(null);
      const res = await getSpecies();
      expect(res.status).toBe(401);
    });

    it('lists active species ordered by sort_order with owned=false and the current totalPoints', async () => {
      await seedUser(50);
      await seedSpecies({ code: 'ocean', name: '海洋之蛋', cost: 30, sortOrder: 1 });
      await seedSpecies({ code: 'forest', name: '森林之蛋', cost: 20, sortOrder: 0 });

      const res = await getSpecies();
      expect(res.status).toBe(200);
      const body = (await res.json()) as GetStoreSpeciesResponse;
      expect(body.totalPoints).toBe(50);
      expect(body.data.map((s) => s.code)).toEqual(['forest', 'ocean']);
      expect(body.data.every((s) => s.owned === false)).toBe(true);
      // null, not 0: the species has no level at all, which the
      // collection view renders differently from "owned but at LV1".
      expect(body.data.every((s) => s.level === null)).toBe(true);
    });

    it('excludes inactive species from the listing', async () => {
      await seedUser(50);
      await seedSpecies({ code: 'forest', isActive: true });
      await seedSpecies({ code: 'retired', isActive: false });

      const res = await getSpecies();
      const body = (await res.json()) as GetStoreSpeciesResponse;
      expect(body.data.map((s) => s.code)).toEqual(['forest']);
    });

    it('marks a species owned=true once the user has redeemed it', async () => {
      const userId = await seedUser(50);
      const speciesId = await seedSpecies();
      const db = getDb();
      await db.insert(userGuardianTable).values({ userId, guardianId: speciesId, createdAt: new Date(), updatedAt: new Date() });

      const res = await getSpecies();
      const body = (await res.json()) as GetStoreSpeciesResponse;
      expect(body.data[0].owned).toBe(true);
      expect(body.data[0].level).toBe(1);
    });

    // The collection view sorts by progress, so it needs the grown level
    // and not merely the fact of ownership.
    it('reports the grown level of an owned species', async () => {
      const userId = await seedUser(50);
      const speciesId = await seedSpecies();
      await getDb()
        .insert(userGuardianTable)
        .values({ userId, guardianId: speciesId, level: 4, xp: 120, createdAt: new Date(), updatedAt: new Date() });

      const res = await getSpecies();
      const body = (await res.json()) as GetStoreSpeciesResponse;
      expect(body.data[0].level).toBe(4);
    });
  });

  describe('POST /redeem', () => {
    it('rejects with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdTokenUid).mockResolvedValue(null);
      const res = await postRedeem({ speciesId: 1 });
      expect(res.status).toBe(401);
    });

    it('creates a user_guardian row, deducts totalPoints (not lifetimePoints), and logs a SPEND_EGG_REDEEM transaction', async () => {
      const userId = await seedUser(50);
      const speciesId = await seedSpecies({ cost: 20 });

      const res = await postRedeem({ speciesId });
      expect(res.status).toBe(200);
      const body = (await res.json()) as PostRedeemResponse;
      expect(body.totalPoints).toBe(30);
      expect(body.guardian).toMatchObject({ speciesId, level: 1, xp: 0 });

      const db = getDb();
      const [guardian] = await db.select().from(userGuardianTable).where(eq(userGuardianTable.userId, userId));
      expect(guardian).toMatchObject({ guardianId: speciesId, level: 1, xp: 0 });

      const [updatedUser] = await db.select().from(userTable).where(eq(userTable.id, userId));
      expect(updatedUser.totalPoints).toBe(30);
      expect(updatedUser.lifetimePoints).toBe(50);

      const [transaction] = await db
        .select()
        .from(pointTransactionTable)
        .where(eq(pointTransactionTable.userId, userId));
      expect(transaction).toMatchObject({ type: 'SPEND_EGG_REDEEM', amount: -20, balanceAfter: 30, replyId: null });
    });

    it('rejects with 400 when totalPoints is below the species cost', async () => {
      await seedUser(10);
      const speciesId = await seedSpecies({ cost: 20 });

      const res = await postRedeem({ speciesId });
      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.code).toBe('INSUFFICIENT_POINTS');
    });

    it('rejects with 400 when the user already owns a guardian of that species', async () => {
      const userId = await seedUser(100);
      const speciesId = await seedSpecies({ cost: 20 });
      const db = getDb();
      await db.insert(userGuardianTable).values({ userId, guardianId: speciesId, createdAt: new Date(), updatedAt: new Date() });

      const res = await postRedeem({ speciesId });
      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.code).toBe('ALREADY_OWNED');
    });

    it('rejects with 404 for an unknown speciesId', async () => {
      await seedUser(100);

      const res = await postRedeem({ speciesId: 999999 });
      expect(res.status).toBe(404);
    });

    it('rejects with 404 for an inactive species', async () => {
      await seedUser(100);
      const speciesId = await seedSpecies({ isActive: false });

      const res = await postRedeem({ speciesId });
      expect(res.status).toBe(404);
    });

    it('rejects the VIP species with SUBSCRIPTION_REQUIRED when the user has no paid access', async () => {
      const userId = await seedUser(100);
      const speciesId = await seedSpecies({ code: VIP_GUARDIAN_CODE, cost: 10 });

      const res = await postRedeem({ speciesId });
      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrorBody).code).toBe('SUBSCRIPTION_REQUIRED');

      // The frontend gate is bypassable by design, so this one carries the
      // rule: nothing may be spent and no guardian may exist afterwards.
      const db = getDb();
      const [user] = await db.select().from(userTable).where(eq(userTable.id, userId));
      expect(user.totalPoints).toBe(100);
      expect(await db.select().from(userGuardianTable)).toHaveLength(0);
    });

    it('redeems the VIP species for a subscriber', async () => {
      const userId = await seedUser(100);
      await seedSubscription(userId);
      const speciesId = await seedSpecies({ code: VIP_GUARDIAN_CODE, cost: 10 });

      const res = await postRedeem({ speciesId });
      expect(res.status).toBe(200);
      expect(((await res.json()) as PostRedeemResponse).totalPoints).toBe(90);
    });

    it('redeems the VIP species for a cancelled subscription still inside its paid period', async () => {
      const userId = await seedUser(100);
      await seedSubscription(userId, 'cancelled');
      const speciesId = await seedSpecies({ code: VIP_GUARDIAN_CODE, cost: 10 });

      const res = await postRedeem({ speciesId });
      expect(res.status).toBe(200);
    });

    it('rejects the VIP species once its paid period has ended', async () => {
      const userId = await seedUser(100);
      await seedSubscription(userId, 'active', -1);
      const speciesId = await seedSpecies({ code: VIP_GUARDIAN_CODE, cost: 10 });

      const res = await postRedeem({ speciesId });
      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrorBody).code).toBe('SUBSCRIPTION_REQUIRED');
    });

    it('reports ALREADY_OWNED rather than SUBSCRIPTION_REQUIRED when a lapsed subscriber owns the VIP egg', async () => {
      const userId = await seedUser(100);
      const speciesId = await seedSpecies({ code: VIP_GUARDIAN_CODE, cost: 10 });
      const db = getDb();
      await db.insert(userGuardianTable).values({
        userId,
        guardianId: speciesId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await postRedeem({ speciesId });
      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrorBody).code).toBe('ALREADY_OWNED');
    });

    it('does not deduct points or create a guardian row when redemption fails', async () => {
      const userId = await seedUser(10);
      const speciesId = await seedSpecies({ cost: 20 });

      await postRedeem({ speciesId });

      const db = getDb();
      const [updatedUser] = await db.select().from(userTable).where(eq(userTable.id, userId));
      expect(updatedUser.totalPoints).toBe(10);
      const guardians = await db.select().from(userGuardianTable).where(eq(userGuardianTable.userId, userId));
      expect(guardians).toHaveLength(0);
    });
  });

  /**
   * What the OpenAPI document promises, against what is sent.
   *
   * The key checks are separate from the parse because zod strips
   * unknown keys instead of rejecting them, and the handler's
   * `satisfies` does not catch an extra one either: a row with
   * properties the schema does not mention is still assignable to it.
   */
  it('sends exactly what the OpenAPI document describes', async () => {
    await seedUser(100);
    const speciesId = await seedSpecies({ cost: 20 });

    const shelf: unknown = await (await getSpecies()).json();
    const shelfParsed = getStoreSpeciesResponseSchema.safeParse(shelf);
    expect(shelfParsed.error?.issues ?? []).toEqual([]);
    expect(Object.keys(shelf as object).sort()).toEqual(['data', 'totalPoints']);
    expect(Object.keys((shelf as { data: object[] }).data[0]).sort()).toEqual([
      'code',
      'cost',
      'id',
      'level',
      'name',
      'owned',
      'theme',
    ]);

    const redeemed: unknown = await (await postRedeem({ speciesId })).json();
    expect(postStoreRedeemResponseSchema.safeParse(redeemed).error?.issues ?? []).toEqual([]);
    expect(Object.keys(redeemed as object).sort()).toEqual(['guardian', 'totalPoints']);
    expect(Object.keys((redeemed as { guardian: object }).guardian).sort()).toEqual([
      'id',
      'level',
      'speciesId',
      'xp',
    ]);
  });
});
