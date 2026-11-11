import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
import {
  charityCategoryTable,
  guardianTable,
  pointTransactionTable,
  userGuardianTable,
  userSubscriptionTable,
  userTable,
} from 'src/db/schema';

import { getGuardianResponseSchema, postGuardianInvestResponseSchema } from 'src/routes/guardian';

vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdTokenUid: vi.fn() }));
import { verifyIdTokenUid } from 'src/lib/firebaseAdmin';

/**
 * Inferred from the route's own schemas, not written again here.
 *
 * This file used to carry a third hand-written copy of the guardian
 * shape -- after packages/shared's and the route's -- and a test that
 * describes the response for itself cannot notice the response changing.
 */
type GetGuardianResponse = z.infer<typeof getGuardianResponseSchema>;
type PostInvestResponse = z.infer<typeof postGuardianInvestResponseSchema>;
type ErrorBody = { message: string; code?: string };

const getGuardians = () => app.request('/api/guardian');

const postInvest = (id: number, body: unknown) =>
  app.request(`/api/guardian/${id}/invest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// FK-safe order: guardian references charity_category, so categories go
// after the species that point at them.
const clearTables = async () => {
  const db = getDb();
  await db.delete(pointTransactionTable);
  await db.delete(userGuardianTable);
  await db.delete(userSubscriptionTable);
  await db.delete(guardianTable);
  await db.delete(userTable);
  await db.delete(charityCategoryTable);
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A subscription period, seeded directly rather than bought.
 *
 * `status` and `currentPeriodEnd` are the only two columns entitlement is
 * decided from, so they are the only interesting arguments. 'cancelled'
 * with an end in the future is the state this file's bonus block exists
 * for: auto-renew off, days still paid for.
 */
const seedSubscription = async (
  userId: number,
  { plan = 'monthly', status = 'active', endsInDays = 30 } = {}
) => {
  const db = getDb();
  const now = new Date();
  await db.insert(userSubscriptionTable).values({
    userId,
    plan,
    status,
    currentPeriodStart: new Date(now.getTime() - DAY_MS),
    currentPeriodEnd: new Date(now.getTime() + endsInDays * DAY_MS),
    provider: 'ecpay',
    providerRef: `fixture-${userId}-${status}`,
    createdAt: now,
    updatedAt: now,
  });
};

let categorySeq = 0;

const seedCategory = async () => {
  const db = getDb();
  categorySeq += 1;
  const [{ insertId }] = await db.insert(charityCategoryTable).values({
    code: `cat-${categorySeq}`,
    name: `類別 ${categorySeq}`,
    sortOrder: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return insertId;
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
      expect(body.data[0]).toMatchObject({ guardianId: speciesId, level: 1, xp: 0, nextLevelXp: 2_500 });
    });

    it('names the category the spirit supports, which the LV5 donation screen needs', async () => {
      // The donation flow is per spirit: it has to list that category's
      // organisations, and `theme` is only a display label.
      const userId = await seedUser(0);
      const categoryId = await seedCategory();
      const speciesId = await seedSpecies({ categoryId });
      await seedOwnedGuardian(userId, speciesId);

      const body = (await (await getGuardians()).json()) as GetGuardianResponse;
      expect(body.data[0].category).toEqual({ id: categoryId, name: '類別 1' });
    });

    it('still returns a spirit whose species is tied to no category', async () => {
      // This is what VIP is -- categoryId null, owner may direct the
      // donation at any category. An inner join here would drop the spirit
      // out of its owner's own collection, which is strictly worse than
      // not naming a category.
      const userId = await seedUser(0);
      const speciesId = await seedSpecies({ categoryId: null });
      await seedOwnedGuardian(userId, speciesId);

      const body = (await (await getGuardians()).json()) as GetGuardianResponse;
      expect(body.data).toHaveLength(1);
      expect(body.data[0].category).toBeNull();
    });

    it('returns nextLevelXp=null for a max-level guardian', async () => {
      const userId = await seedUser(0);
      const speciesId = await seedSpecies();
      await seedOwnedGuardian(userId, speciesId, { level: 5, xp: 0 });

      const res = await getGuardians();
      const body = (await res.json()) as GetGuardianResponse;
      expect(body.data[0].nextLevelXp).toBeNull();
    });

    /**
     * What the OpenAPI document promises, checked against what the
     * server actually sends.
     *
     * The schema is the document's only source, so a response that does
     * not match it means the document is wrong -- and the clients
     * generated from it with it. The key check is separate on purpose:
     * zod strips unknown keys rather than rejecting them, so a column
     * added to the query and spread into the DTO would pass the parse
     * while appearing in no document.
     *
     * Last in this block because seedCategory numbers the categories it
     * creates ('類別 1', '類別 2'), and a test above asserts that name.
     */
    it('sends exactly what the OpenAPI document describes', async () => {
      const userId = await seedUser(100);
      const categoryId = await seedCategory();
      const speciesId = await seedSpecies({ categoryId });
      await seedOwnedGuardian(userId, speciesId);

      const body: unknown = await (await getGuardians()).json();

      const parsed = getGuardianResponseSchema.safeParse(body);
      expect(parsed.error?.issues ?? []).toEqual([]);
      expect(parsed.success).toBe(true);
      expect(Object.keys((body as GetGuardianResponse).data[0]).sort()).toEqual([
        'category',
        'code',
        'guardianId',
        'id',
        'level',
        'name',
        'nextLevelXp',
        'theme',
        'xp',
      ]);
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
      expect(body.guardian).toMatchObject({ level: 1, xp: 500, nextLevelXp: 2_500 });
      expect(body.totalPoints).toBe(500);

      const db = getDb();
      const [row] = await db.select().from(userGuardianTable).where(eq(userGuardianTable.id, userGuardianId));
      expect(row).toMatchObject({ level: 1, xp: 500 });
    });

    /**
     * The subscriber growth bonus, which the box and subscription pages
     * promise in four places.
     *
     * One case per state a user can be in, because the gate is not "has
     * an agreement" but "has paid access" -- the same question
     * requireSubscription asks. Getting it wrong is invisible from the
     * outside: the invest still succeeds, it just quietly pays the wrong
     * amount, and the user has no way to check.
     */
    describe('the subscriber growth bonus', () => {
      const investWith = async (
        points: number,
        subscription?: { plan?: string; status?: string; endsInDays?: number }
      ) => {
        const userId = await seedUser(100_000);
        if (subscription !== undefined) await seedSubscription(userId, subscription);
        const speciesId = await seedSpecies();
        const userGuardianId = await seedOwnedGuardian(userId, speciesId);

        const res = await postInvest(userGuardianId, { points });
        expect(res.status).toBe(200);
        return (await res.json()) as PostInvestResponse;
      };

      it('pays nothing to a user with no entitlement', async () => {
        const body = await investWith(1_000);
        expect(body.xpGained).toBe(1_000);
        expect(body.guardian).toMatchObject({ xp: 1_000 });
      });

      it('pays 10% on a live agreement', async () => {
        const body = await investWith(1_000, { status: 'active' });
        expect(body.xpGained).toBe(1_100);
        expect(body.guardian).toMatchObject({ xp: 1_100 });
      });

      it('pays 10% on a cancelled agreement that has not run out', async () => {
        // The state nothing considered. Cancelling auto-renew flips the
        // period to 'cancelled' at once, but the days are already paid
        // for: findActiveSubscription says no, findEntitledSubscription
        // says yes, and the paid answer is the correct one.
        const body = await investWith(1_000, { status: 'cancelled', endsInDays: 12 });
        expect(body.xpGained).toBe(1_100);
      });

      it('pays 10% on a day pass, which has no agreement at all', async () => {
        const body = await investWith(1_000, { plan: 'days30', endsInDays: 30 });
        expect(body.xpGained).toBe(1_100);
      });

      it('pays nothing once the paid period has ended', async () => {
        const body = await investWith(1_000, { status: 'cancelled', endsInDays: -1 });
        expect(body.xpGained).toBe(1_000);
      });

      it('spends the points asked for, never the bonus', async () => {
        // The bonus is growth, not a discount: 1,000 invested costs
        // 1,000 whether or not the user has paid access.
        const body = await investWith(1_000, { status: 'active' });
        expect(body.xpGained).toBe(1_100);
        expect(body.totalPoints).toBe(99_000);
      });

      it('counts the bonus toward levelling up', async () => {
        // 2,500 is the Lv1->Lv2 threshold: 2,273 + 227 reaches it and
        // 2,273 alone does not, so this fails if the bonus is added
        // after the level loop instead of before it.
        const body = await investWith(2_273, { status: 'active' });
        expect(body.xpGained).toBe(2_500);
        expect(body.guardian).toMatchObject({ level: 2, xp: 0 });
      });
    });

    it('sends exactly what the OpenAPI document describes', async () => {
      const userId = await seedUser(5_000);
      const speciesId = await seedSpecies();
      const guardianId = await seedOwnedGuardian(userId, speciesId);

      const res = await postInvest(guardianId, { points: 100 });
      expect(res.status).toBe(200);
      const body: unknown = await res.json();

      const parsed = postGuardianInvestResponseSchema.safeParse(body);
      expect(parsed.error?.issues ?? []).toEqual([]);
      expect(parsed.success).toBe(true);
      expect(Object.keys(body as PostInvestResponse).sort()).toEqual([
        'guardian',
        'totalPoints',
        'xpGained',
      ]);
    });

    it('levels up and carries the xp remainder over the threshold', async () => {
      const userId = await seedUser(100_000);
      const speciesId = await seedSpecies();
      const userGuardianId = await seedOwnedGuardian(userId, speciesId);

      // 2,500 needed for Lv1->2; investing 3,000 should land at level 2
      // with 500 xp carried over.
      const res = await postInvest(userGuardianId, { points: 3_000 });
      const body = (await res.json()) as PostInvestResponse;
      expect(body.guardian).toMatchObject({ level: 2, xp: 500, nextLevelXp: 7_500 });
    });

    it('jumps multiple levels in a single large investment', async () => {
      const userId = await seedUser(100_000);
      const speciesId = await seedSpecies();
      const userGuardianId = await seedOwnedGuardian(userId, speciesId);

      // 2,500 + 7,500 + 100 = 10,100 -> lands at level 3 with 100 xp.
      const res = await postInvest(userGuardianId, { points: 10_100 });
      const body = (await res.json()) as PostInvestResponse;
      expect(body.guardian).toMatchObject({ level: 3, xp: 100, nextLevelXp: 22_500 });
    });

    it('reaches exactly max level with zero leftover xp when investing exactly 100,000', async () => {
      const userId = await seedUser(105_000);
      const speciesId = await seedSpecies();
      const userGuardianId = await seedOwnedGuardian(userId, speciesId);

      const res = await postInvest(userGuardianId, { points: 100_000 });
      const body = (await res.json()) as PostInvestResponse;
      expect(body.guardian).toMatchObject({ level: 5, xp: 0, nextLevelXp: null });
    });

    it('reaches max level and discards any xp overflow beyond the final threshold', async () => {
      const userId = await seedUser(150_000);
      const speciesId = await seedSpecies();
      const userGuardianId = await seedOwnedGuardian(userId, speciesId);

      // Full chain to max level is 100,000; investing 105,000 overshoots.
      const res = await postInvest(userGuardianId, { points: 105_000 });
      const body = (await res.json()) as PostInvestResponse;
      expect(body.guardian).toMatchObject({ level: 5, xp: 0, nextLevelXp: null });
      // Full requested amount still deducted, no partial refund for the overflow.
      expect(body.totalPoints).toBe(45_000);
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
