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
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
import { categoryTable, filterDimensionTable } from 'src/db/schema';
import { ADMIN_EMAILS } from 'src/middleware/adminAuth';

// The admin gate is exercised end-to-end in its own describe block below;
// every other test just needs writes to succeed, so default the mocked
// Firebase verification to the admin identity.
vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdToken: vi.fn() }));
import { verifyIdToken } from 'src/lib/firebaseAdmin';

type FilterDimensionDto = {
  id: number;
  name: string;
  categoryId: number;
  sortOrder: number;
};

const postDimension = (body: unknown) =>
  app.request('/api/filter-dimension', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const putDimension = (id: number | string, body: unknown) =>
  app.request(`/api/filter-dimension/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const deleteDimension = (id: number | string) =>
  app.request(`/api/filter-dimension/${id}`, { method: 'DELETE' });

const clearTables = async () => {
  const db = getDb();
  await db.delete(filterDimensionTable);
  await db.delete(categoryTable);
};

const seedCategory = async (name: string) => {
  const [{ insertId }] = await getDb()
    .insert(categoryTable)
    .values({ name, createdAt: new Date() });
  return insertId;
};

describe('filter-dimension routes', () => {
  beforeAll(clearTables);

  beforeEach(() => {
    vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);
  });

  afterEach(clearTables);

  afterAll(async () => {
    await closeDb();
  });

  it('lists filter dimensions, empty when there is no data', async () => {
    const res = await app.request('/api/filter-dimension');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: [],
      paginate: { total: 0, page: 1, limit: 20, totalPages: 1 },
    });
  });

  it('creates a filter dimension with a default sortOrder and lists it back', async () => {
    const categoryId = await seedCategory('civil service');

    const postRes = await postDimension({ name: '類科分組', categoryId });
    expect(postRes.status).toBe(201);
    const created = (await postRes.json()) as FilterDimensionDto;
    expect(created).toMatchObject({ name: '類科分組', categoryId, sortOrder: 0 });
    expect(created.id).toEqual(expect.any(Number));

    const listRes = await app.request('/api/filter-dimension');
    const listBody = (await listRes.json()) as { data: FilterDimensionDto[] };
    expect(listBody.data).toEqual([created]);
  });

  it('fetches a filter dimension by id', async () => {
    const categoryId = await seedCategory('national exam');
    const created = (await (
      await postDimension({ name: '類科選擇', categoryId })
    ).json()) as FilterDimensionDto;

    const res = await app.request(`/api/filter-dimension/${created.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(created);
  });

  it('404s for an unknown filter dimension id', async () => {
    const res = await app.request('/api/filter-dimension/999999');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      status: 404,
      name: 'NotFoundError',
      code: 'NOT_FOUND',
    });
  });

  it('rejects a missing categoryId with 400 before touching the database', async () => {
    const res = await postDimension({ name: 'no category' });
    expect(res.status).toBe(400);
  });

  describe('PUT /:id', () => {
    it('updates a filter dimension and returns the updated record', async () => {
      const categoryId = await seedCategory('license exam');
      const created = (await (
        await postDimension({ name: 'old name', categoryId, sortOrder: 1 })
      ).json()) as FilterDimensionDto;

      const res = await putDimension(created.id, {
        name: 'new name',
        categoryId,
        sortOrder: 5,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        ...created,
        name: 'new name',
        sortOrder: 5,
      });
    });

    it('404s for an unknown filter dimension id', async () => {
      const categoryId = await seedCategory('license exam 2');
      const res = await putDimension(999999, { name: 'x', categoryId });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /:id', () => {
    it('deletes a filter dimension', async () => {
      const categoryId = await seedCategory('to delete cat');
      const created = (await (
        await postDimension({ name: 'to delete', categoryId })
      ).json()) as FilterDimensionDto;

      const res = await deleteDimension(created.id);
      expect(res.status).toBe(204);

      const getRes = await app.request(`/api/filter-dimension/${created.id}`);
      expect(getRes.status).toBe(404);
    });

    it('404s for an unknown filter dimension id', async () => {
      const res = await deleteDimension(999999);
      expect(res.status).toBe(404);
    });
  });

  describe('pagination and sorting', () => {
    it('sorts by sortOrder ascending by default', async () => {
      const categoryId = await seedCategory('sort cat');
      const second = (await (
        await postDimension({ name: 'second', categoryId, sortOrder: 2 })
      ).json()) as FilterDimensionDto;
      const first = (await (
        await postDimension({ name: 'first', categoryId, sortOrder: 1 })
      ).json()) as FilterDimensionDto;

      const res = await app.request('/api/filter-dimension');
      const { data } = (await res.json()) as { data: FilterDimensionDto[] };
      expect(data.map((d) => d.id)).toEqual([first.id, second.id]);
    });

    it('sorts by the linked category name', async () => {
      const catA = await seedCategory('a-category');
      const catB = await seedCategory('b-category');
      await postDimension({ name: 'dim-b', categoryId: catB });
      await postDimension({ name: 'dim-a', categoryId: catA });

      const res = await app.request(
        '/api/filter-dimension?sort=category&order=asc'
      );
      const { data } = (await res.json()) as { data: FilterDimensionDto[] };
      expect(data.map((d) => d.categoryId)).toEqual([catA, catB]);
    });

    it('rejects an invalid sort column with 400', async () => {
      const res = await app.request('/api/filter-dimension?sort=bogus');
      expect(res.status).toBe(400);
    });
  });

  describe('admin auth gate', () => {
    it('rejects a write with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await postDimension({ name: 'blocked', categoryId: 1 });
      expect(res.status).toBe(401);
    });

    it('rejects a write with 403 for a non-admin email', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue('someone-else@example.com');

      const res = await postDimension({ name: 'blocked', categoryId: 1 });
      expect(res.status).toBe(403);
    });

    it('leaves GET ungated even with no valid identity', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await app.request('/api/filter-dimension');
      expect(res.status).toBe(200);
    });
  });
});
