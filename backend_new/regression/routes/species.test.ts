import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
import {
  charityCategoryTable,
  guardianTable,
  userGuardianTable,
  userTable,
} from 'src/db/schema';
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
  category: { id: number; name: string } | null;
  ownersByLevel: Record<string, number>;
};

const getSpecies = () => app.request('/api/species');

const clearTables = async () => {
  const db = getDb();
  await db.delete(userGuardianTable);
  // Before the categories: guardian.category_id references them.
  await db.delete(guardianTable);
  await db.delete(userTable);
  await db.delete(charityCategoryTable);
};

const seedCategory = async (code: string) => {
  const [{ insertId }] = await getDb()
    .insert(charityCategoryTable)
    .values({ code, name: `${code} category`, sortOrder: 1, isActive: true, createdAt: new Date() });
  return insertId;
};

const seedSpecies = async (
  code: string,
  {
    cost = 20,
    sortOrder = 1,
    isActive = true,
    categoryId = null,
  }: {
    cost?: number;
    sortOrder?: number;
    isActive?: boolean;
    categoryId?: number | null;
  } = {}
) => {
  const [{ insertId }] = await getDb().insert(guardianTable).values({
    code,
    name: `${code} egg`,
    theme: `${code} theme`,
    cost,
    sortOrder,
    isActive,
    categoryId,
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

    // A flat total would not answer what the page is for: whether anyone
    // reaches the later stages, or everyone stalls at LV1.
    it('breaks owners down by the level they have reached', async () => {
      const db = getDb();
      const ownedId = await seedSpecies('owned', { sortOrder: 1 });
      await seedSpecies('unowned', { sortOrder: 2 });
      const users = [];
      for (const uid of ['a', 'b', 'c']) {
        const [{ insertId }] = await db
          .insert(userTable)
          .values({ firebaseUid: uid, email: uid + '@example.com', createdAt: new Date() });
        users.push(insertId);
      }
      await db.insert(userGuardianTable).values([
        { userId: users[0], guardianId: ownedId, level: 1, createdAt: new Date(), updatedAt: new Date() },
        { userId: users[1], guardianId: ownedId, level: 1, createdAt: new Date(), updatedAt: new Date() },
        { userId: users[2], guardianId: ownedId, level: 4, createdAt: new Date(), updatedAt: new Date() },
      ]);
      vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);

      const body = (await (await getSpecies()).json()) as SpeciesDto[];
      expect(body.find((s) => s.code === 'owned')?.ownersByLevel).toEqual({ '1': 2, '4': 1 });
      // A level nobody has reached is absent rather than zero.
      expect(body.find((s) => s.code === 'owned')?.ownersByLevel['2']).toBeUndefined();
      expect(body.find((s) => s.code === 'unowned')?.ownersByLevel).toEqual({});
    });

    // The whole reason this field exists: `theme` reads the same as the
    // category name today, so without it a species seeded with no
    // category_id is indistinguishable on the page from a correct one.
    it('names the category a species supports, and says so when there is none', async () => {
      const categoryId = await seedCategory('children');
      await seedSpecies('bound', { sortOrder: 1, categoryId });
      await seedSpecies('unbound', { sortOrder: 2 });
      vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);

      const body = (await (await getSpecies()).json()) as SpeciesDto[];
      expect(body.find((s) => s.code === 'bound')?.category).toEqual({
        id: categoryId,
        name: 'children category',
      });
      // null, not omitted and not an empty object -- the page branches on it.
      expect(body.find((s) => s.code === 'unbound')?.category).toBeNull();
    });

    // A left join, not an inner one: an inner join would have hidden the
    // unbound row entirely, which is the failure this guards.
    it('still lists a species that supports no category', async () => {
      await seedSpecies('unbound', { sortOrder: 1 });
      vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);

      const body = (await (await getSpecies()).json()) as SpeciesDto[];
      expect(body.map((s) => s.code)).toEqual(['unbound']);
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
