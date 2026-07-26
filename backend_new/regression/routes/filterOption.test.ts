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
import {
  categoryTable,
  filterDimensionTable,
  filterOptionTable,
  filterSubjectOptionTable,
  subjectTable,
} from 'src/db/schema';
import { ADMIN_EMAILS } from 'src/middleware/adminAuth';

// The admin gate is exercised end-to-end in its own describe block below;
// every other test just needs writes to succeed, so default the mocked
// Firebase verification to the admin identity.
vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdToken: vi.fn() }));
import { verifyIdToken } from 'src/lib/firebaseAdmin';

type FilterOptionDto = {
  id: number;
  name: string;
  dimensionId: number;
  parentId: number | null;
};

type FilterOptionListDto = FilterOptionDto & { subjects: string | null };

const postOption = (body: unknown) =>
  app.request('/api/filter-option', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const putOption = (id: number | string, body: unknown) =>
  app.request(`/api/filter-option/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const deleteOption = (id: number | string) =>
  app.request(`/api/filter-option/${id}`, { method: 'DELETE' });

const getOptionSubject = (id: number | string) =>
  app.request(`/api/filter-option/${id}/subject`);

const putOptionSubject = (id: number | string, body: unknown) =>
  app.request(`/api/filter-option/${id}/subject`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const clearTables = async () => {
  const db = getDb();
  await db.delete(filterSubjectOptionTable);
  // filter_option.parent_id is self-referential -- a bulk DELETE can hit a
  // parent row before a still-live child row that points to it, tripping
  // the FK. Null out every self-reference first so the delete has nothing
  // left to violate.
  await db.update(filterOptionTable).set({ parentId: null });
  await db.delete(filterOptionTable);
  await db.delete(filterDimensionTable);
  await db.delete(subjectTable);
  await db.delete(categoryTable);
};

const seedDimension = async (name = 'dim') => {
  const db = getDb();
  const [{ insertId: categoryId }] = await db
    .insert(categoryTable)
    .values({ name: `${name}-cat`, createdAt: new Date() });
  const [{ insertId: dimensionId }] = await db
    .insert(filterDimensionTable)
    .values({ name, categoryId });
  return dimensionId;
};

const seedSubject = async (name = 'subject') => {
  const [{ insertId }] = await getDb()
    .insert(subjectTable)
    .values({ name, createdAt: new Date() });
  return insertId;
};

describe('filter-option routes', () => {
  beforeAll(clearTables);

  beforeEach(() => {
    vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);
  });

  afterEach(clearTables);

  afterAll(async () => {
    await closeDb();
  });

  it('lists filter options, empty when there is no data', async () => {
    const res = await app.request('/api/filter-option');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: [],
      paginate: { total: 0, page: 1, limit: 20, totalPages: 1 },
    });
  });

  it('creates a top-level filter option (no parent) and lists it back', async () => {
    const dimensionId = await seedDimension();

    const postRes = await postOption({ name: '行政類', dimensionId });
    expect(postRes.status).toBe(201);
    const created = (await postRes.json()) as FilterOptionDto;
    expect(created).toMatchObject({
      name: '行政類',
      dimensionId,
      parentId: null,
    });

    const listRes = await app.request('/api/filter-option');
    const listBody = (await listRes.json()) as { data: FilterOptionListDto[] };
    expect(listBody.data).toEqual([{ ...created, subjects: null }]);
  });

  it('shows a comma-separated list of linked subject names', async () => {
    const dimensionId = await seedDimension();
    const option = (await (
      await postOption({ name: '普通行政', dimensionId })
    ).json()) as FilterOptionDto;
    const subjectA = await seedSubject('civics');
    const subjectB = await seedSubject('law');
    await putOptionSubject(option.id, { subjectIds: [subjectA, subjectB] });

    const res = await app.request('/api/filter-option');
    const { data } = (await res.json()) as { data: FilterOptionListDto[] };
    expect(data[0].subjects).toBe('civics, law');
  });

  it('creates a nested filter option with a parent', async () => {
    const dimensionId = await seedDimension();
    const parent = (await (
      await postOption({ name: '行政類', dimensionId })
    ).json()) as FilterOptionDto;

    const childRes = await postOption({
      name: '普通行政',
      dimensionId,
      parentId: parent.id,
    });
    expect(childRes.status).toBe(201);
    const child = (await childRes.json()) as FilterOptionDto;
    expect(child.parentId).toBe(parent.id);
  });

  it('fetches a filter option by id', async () => {
    const dimensionId = await seedDimension();
    const created = (await (
      await postOption({ name: '技術類', dimensionId })
    ).json()) as FilterOptionDto;

    const res = await app.request(`/api/filter-option/${created.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(created);
  });

  it('404s for an unknown filter option id', async () => {
    const res = await app.request('/api/filter-option/999999');
    expect(res.status).toBe(404);
  });

  it('rejects a missing dimensionId with 400', async () => {
    const res = await postOption({ name: 'no dimension' });
    expect(res.status).toBe(400);
  });

  describe('PUT /:id', () => {
    it('updates a filter option, including reparenting', async () => {
      const dimensionId = await seedDimension();
      const parentA = (await (
        await postOption({ name: 'parent A', dimensionId })
      ).json()) as FilterOptionDto;
      const parentB = (await (
        await postOption({ name: 'parent B', dimensionId })
      ).json()) as FilterOptionDto;
      const child = (await (
        await postOption({
          name: 'child',
          dimensionId,
          parentId: parentA.id,
        })
      ).json()) as FilterOptionDto;

      const res = await putOption(child.id, {
        name: 'child renamed',
        dimensionId,
        parentId: parentB.id,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        name: 'child renamed',
        parentId: parentB.id,
      });
    });

    it('clears a parent by passing null', async () => {
      const dimensionId = await seedDimension();
      const parent = (await (
        await postOption({ name: 'parent', dimensionId })
      ).json()) as FilterOptionDto;
      const child = (await (
        await postOption({ name: 'child', dimensionId, parentId: parent.id })
      ).json()) as FilterOptionDto;

      const res = await putOption(child.id, {
        name: 'child',
        dimensionId,
        parentId: null,
      });
      expect((await res.json()) as FilterOptionDto).toMatchObject({
        parentId: null,
      });
    });

    it('404s for an unknown filter option id', async () => {
      const dimensionId = await seedDimension();
      const res = await putOption(999999, { name: 'x', dimensionId });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /:id', () => {
    it('deletes a filter option', async () => {
      const dimensionId = await seedDimension();
      const created = (await (
        await postOption({ name: 'to delete', dimensionId })
      ).json()) as FilterOptionDto;

      const res = await deleteOption(created.id);
      expect(res.status).toBe(204);

      const getRes = await app.request(`/api/filter-option/${created.id}`);
      expect(getRes.status).toBe(404);
    });

    it('404s for an unknown filter option id', async () => {
      const res = await deleteOption(999999);
      expect(res.status).toBe(404);
    });

    it('un-parents children instead of blocking the delete', async () => {
      const dimensionId = await seedDimension();
      const parent = (await (
        await postOption({ name: 'parent', dimensionId })
      ).json()) as FilterOptionDto;
      const child = (await (
        await postOption({ name: 'child', dimensionId, parentId: parent.id })
      ).json()) as FilterOptionDto;

      const res = await deleteOption(parent.id);
      expect(res.status).toBe(204);

      const getChild = await app.request(`/api/filter-option/${child.id}`);
      expect((await getChild.json()) as FilterOptionDto).toMatchObject({
        parentId: null,
      });
    });

    it('deletes a filter option that still has linked subjects', async () => {
      const dimensionId = await seedDimension();
      const option = (await (
        await postOption({ name: 'linked', dimensionId })
      ).json()) as FilterOptionDto;
      const subjectId = await seedSubject();
      await putOptionSubject(option.id, { subjectIds: [subjectId] });

      const res = await deleteOption(option.id);
      expect(res.status).toBe(204);
    });
  });

  describe('/:id/subject', () => {
    it('returns an empty array for an option with no linked subjects', async () => {
      const dimensionId = await seedDimension();
      const option = (await (
        await postOption({ name: 'no links', dimensionId })
      ).json()) as FilterOptionDto;

      const res = await getOptionSubject(option.id);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ subjectIds: [] });
    });

    it('404s GET for an unknown filter option id', async () => {
      const res = await getOptionSubject(999999);
      expect(res.status).toBe(404);
    });

    it('sets, replaces, and clears subject links', async () => {
      const dimensionId = await seedDimension();
      const option = (await (
        await postOption({ name: 'physics-related', dimensionId })
      ).json()) as FilterOptionDto;
      const subject1 = await seedSubject('physics');
      const subject2 = await seedSubject('chemistry');

      const setRes = await putOptionSubject(option.id, {
        subjectIds: [subject1, subject2],
      });
      expect(setRes.status).toBe(200);
      const setBody = (await setRes.json()) as { subjectIds: number[] };
      expect(setBody.subjectIds.sort()).toEqual([subject1, subject2].sort());

      const replaceRes = await putOptionSubject(option.id, {
        subjectIds: [subject1],
      });
      expect(await replaceRes.json()).toEqual({ subjectIds: [subject1] });

      const clearRes = await putOptionSubject(option.id, { subjectIds: [] });
      expect(await clearRes.json()).toEqual({ subjectIds: [] });
    });

    it('404s PUT for an unknown filter option id', async () => {
      const res = await putOptionSubject(999999, { subjectIds: [] });
      expect(res.status).toBe(404);
    });
  });

  describe('pagination and sorting', () => {
    it('sorts by the linked dimension name', async () => {
      const dimA = await seedDimension('a-dim');
      const dimB = await seedDimension('b-dim');
      await postOption({ name: 'opt-b', dimensionId: dimB });
      await postOption({ name: 'opt-a', dimensionId: dimA });

      const res = await app.request(
        '/api/filter-option?sort=dimension&order=asc'
      );
      const { data } = (await res.json()) as { data: FilterOptionDto[] };
      expect(data.map((o) => o.dimensionId)).toEqual([dimA, dimB]);
    });

    it('sorts by the linked subjects summary', async () => {
      const dimensionId = await seedDimension();
      const optA = (await (
        await postOption({ name: 'opt-a', dimensionId })
      ).json()) as FilterOptionDto;
      const optB = (await (
        await postOption({ name: 'opt-b', dimensionId })
      ).json()) as FilterOptionDto;
      const subjectA = await seedSubject('a-subject');
      const subjectB = await seedSubject('b-subject');
      await putOptionSubject(optA.id, { subjectIds: [subjectB] });
      await putOptionSubject(optB.id, { subjectIds: [subjectA] });

      const res = await app.request(
        '/api/filter-option?sort=subjects&order=asc'
      );
      const { data } = (await res.json()) as { data: FilterOptionListDto[] };
      expect(data.map((o) => o.id)).toEqual([optB.id, optA.id]);
    });

    it('rejects an invalid sort column with 400', async () => {
      const res = await app.request('/api/filter-option?sort=bogus');
      expect(res.status).toBe(400);
    });
  });

  describe('admin auth gate', () => {
    it('rejects a write with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await postOption({ name: 'blocked', dimensionId: 1 });
      expect(res.status).toBe(401);
    });

    it('rejects a write with 403 for a non-admin email', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue('someone-else@example.com');

      const res = await postOption({ name: 'blocked', dimensionId: 1 });
      expect(res.status).toBe(403);
    });

    it('leaves GET ungated even with no valid identity', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await app.request('/api/filter-option');
      expect(res.status).toBe(200);
    });
  });
});
