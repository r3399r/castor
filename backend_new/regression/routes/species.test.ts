import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
import { guardianTable, userGuardianTable, userTable } from 'src/db/schema';
import { ADMIN_EMAILS } from 'src/middleware/adminAuth';

vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdToken: vi.fn(), verifyIdTokenUid: vi.fn() }));
import { verifyIdToken } from 'src/lib/firebaseAdmin';

type SpeciesDto = {
  id: number;
  code: string;
  name: string;
  theme: string;
  cost: number;
  sortOrder: number;
  isActive: boolean;
  ownerCount: number;
};

const getSpecies = () => app.request('/api/species');

const clearTables = async () => {
  const db = getDb();
  await db.delete(userGuardianTable);
  await db.delete(guardianTable);
  await db.delete(userTable);
};

const seedSpecies = async (
  code: string,
  { cost = 20, sortOrder = 1, isActive = true }: { cost?: number; sortOrder?: number; isActive?: boolean } = {}
) => {
  const [{ insertId }] = await getDb().insert(guardianTable).values({
    code,
    name: `${code} egg`,
    theme: `${code} theme`,
    cost,
    sortOrder,
    isActive,
    createdAt: new Date(),
  });
  return insertId;
};

describe('species', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await clearTables();
  });

  afterAll(async () => {
    await clearTables();
    await closeDb();
  });

  // adminAuth would have let these through -- it only gates POST/PUT/DELETE,
  // so a GET-only resource needs requireAdmin or it is effectively public.
  describe('admin gate', () => {
    it('rejects an unauthenticated caller', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);
      expect((await getSpecies()).status).toBe(401);
    });

    it('rejects a signed-in non-admin', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue('someone-else@example.com');
      expect((await getSpecies()).status).toBe(403);
    });

    it('admits an admin', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);
      expect((await getSpecies()).status).toBe(200);
    });
  });

  describe('GET /api/species', () => {
    it('returns an empty list when the catalog is empty', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);
      expect(await (await getSpecies()).json()).toEqual([]);
    });

    // The catalog view exists to show what is there, including what has
    // been retired -- unlike GET /store/species, which hides inactive rows.
    it('includes inactive species, which the store listing excludes', async () => {
      await seedSpecies('active-one', { sortOrder: 1 });
      await seedSpecies('retired-one', { sortOrder: 2, isActive: false });
      vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);

      const body = (await (await getSpecies()).json()) as SpeciesDto[];
      expect(body.map((s) => s.code)).toEqual(['active-one', 'retired-one']);
      expect(body[1].isActive).toBe(false);
    });

    it('orders by sortOrder', async () => {
      await seedSpecies('third', { sortOrder: 3 });
      await seedSpecies('first', { sortOrder: 1 });
      await seedSpecies('second', { sortOrder: 2 });
      vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);

      const body = (await (await getSpecies()).json()) as SpeciesDto[];
      expect(body.map((s) => s.code)).toEqual(['first', 'second', 'third']);
    });

    // Lets an admin tell a species nobody has from one that is merely
    // retired -- the two look identical otherwise.
    it('counts how many users own each species', async () => {
      const db = getDb();
      const ownedId = await seedSpecies('owned', { sortOrder: 1 });
      await seedSpecies('unowned', { sortOrder: 2 });
      const [{ insertId: userA }] = await db
        .insert(userTable)
        .values({ firebaseUid: 'a', email: 'a@example.com', createdAt: new Date() });
      const [{ insertId: userB }] = await db
        .insert(userTable)
        .values({ firebaseUid: 'b', email: 'b@example.com', createdAt: new Date() });
      await db.insert(userGuardianTable).values([
        { userId: userA, guardianId: ownedId, createdAt: new Date(), updatedAt: new Date() },
        { userId: userB, guardianId: ownedId, createdAt: new Date(), updatedAt: new Date() },
      ]);
      vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);

      const body = (await (await getSpecies()).json()) as SpeciesDto[];
      expect(body.find((s) => s.code === 'owned')?.ownerCount).toBe(2);
      expect(body.find((s) => s.code === 'unowned')?.ownerCount).toBe(0);
    });

    it('exposes no write verbs', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);
      const post = await app.request('/api/species', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'x', name: 'x', theme: 'x', cost: 1 }),
      });
      expect(post.status).toBe(404);
    });
  });
});
