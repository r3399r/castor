import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
import { charityCategoryTable } from 'src/db/schema';

// No firebaseAdmin mock: this route is read-only and its reads are
// deliberately open, so mocking the verifier would hide it if that ever
// changed.

type CategoryDto = {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};
type ListDto = { data: CategoryDto[]; paginate: { total: number; totalPages: number } };

const getCategories = (query = '') => app.request(`/api/charity-category${query}`);

const clearTables = async () => {
  await getDb().delete(charityCategoryTable);
};

let seq = 0;

const seedCategory = async (overrides: Partial<typeof charityCategoryTable.$inferInsert> = {}) => {
  const db = getDb();
  seq += 1;
  const [{ insertId }] = await db.insert(charityCategoryTable).values({
    code: `cat-${seq}`,
    name: `類別 ${seq}`,
    sortOrder: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  return insertId;
};

describe('charity category routes', () => {
  beforeAll(clearTables);
  afterEach(clearTables);
  afterAll(async () => {
    await closeDb();
  });

  it('lists the categories without any credentials', async () => {
    // The admin organisation form needs this list to offer a picker, and
    // the public page needs it to group organisations. Neither is a reason
    // to require a token: a category name is not private.
    await seedCategory({ name: '兒少、家庭與婦幼' });

    const res = await getCategories();
    expect(res.status).toBe(200);
    const body = (await res.json()) as ListDto;
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ name: '兒少、家庭與婦幼', isActive: true });
  });

  it('orders by sortOrder, then id', async () => {
    const third = await seedCategory({ sortOrder: 9 });
    const first = await seedCategory({ sortOrder: 1 });
    // Same sortOrder as `first`: hand-assigned values collide routinely,
    // and the id tiebreaker is what keeps paging from repeating a row.
    const second = await seedCategory({ sortOrder: 1 });

    const body = (await (await getCategories()).json()) as ListDto;
    expect(body.data.map((row) => row.id)).toEqual([first, second, third]);
  });

  it('filters by isActive, treating "false" as false', async () => {
    // z.coerce.boolean() would map the string "false" to true, which is
    // why the schema spells the two literals out.
    const active = await seedCategory();
    const retired = await seedCategory({ isActive: false });

    const activeOnly = (await (await getCategories('?isActive=true')).json()) as ListDto;
    expect(activeOnly.data.map((row) => row.id)).toEqual([active]);

    const retiredOnly = (await (await getCategories('?isActive=false')).json()) as ListDto;
    expect(retiredOnly.data.map((row) => row.id)).toEqual([retired]);

    const all = (await (await getCategories()).json()) as ListDto;
    expect(all.paginate.total).toBe(2);
  });

  it('paginates', async () => {
    for (let i = 0; i < 3; i++) await seedCategory();

    const body = (await (await getCategories('?limit=2')).json()) as ListDto;
    expect(body.data).toHaveLength(2);
    expect(body.paginate).toMatchObject({ total: 3, totalPages: 2 });
  });

  it('answers an empty page when there are none', async () => {
    const body = (await (await getCategories()).json()) as ListDto;
    expect(body.data).toEqual([]);
    expect(body.paginate.total).toBe(0);
  });

  it('rejects a limit above the maximum', async () => {
    expect((await getCategories('?limit=99999')).status).toBe(400);
  });
});
