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
  subjectCategoryTable,
  subjectTable,
} from 'src/db/schema';
import { ADMIN_EMAILS } from 'src/middleware/adminAuth';

// The admin gate is exercised end-to-end in its own describe block below;
// every other test just needs writes to succeed, so default the mocked
// Firebase verification to the admin identity.
vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdToken: vi.fn() }));
import { verifyIdToken } from 'src/lib/firebaseAdmin';

type CategoryDto = { id: number; name: string; createdAt: string };

const postCategory = (body: unknown) =>
  app.request('/api/category', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const putCategory = (id: number | string, body: unknown) =>
  app.request(`/api/category/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const deleteCategory = (id: number | string) =>
  app.request(`/api/category/${id}`, { method: 'DELETE' });

// Cleared in FK-safe order: subject_category references both category and
// subject, so it must go first.
const clearTables = async () => {
  const db = getDb();
  await db.delete(subjectCategoryTable);
  await db.delete(subjectTable);
  await db.delete(categoryTable);
};

describe('category routes', () => {
  beforeAll(clearTables);

  beforeEach(() => {
    vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);
  });

  afterEach(clearTables);

  afterAll(async () => {
    await closeDb();
  });

  it('lists categories, empty when there is no data', async () => {
    const res = await app.request('/api/category');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('creates a category and lists it back', async () => {
    const postRes = await postCategory({ name: 'english' });
    expect(postRes.status).toBe(201);
    const created = (await postRes.json()) as CategoryDto;
    expect(created).toMatchObject({ name: 'english' });
    expect(created.id).toEqual(expect.any(Number));

    const listRes = await app.request('/api/category');
    expect(await listRes.json()).toEqual([created]);
  });

  it('fetches a category by id', async () => {
    const created = (await (
      await postCategory({ name: 'math' })
    ).json()) as CategoryDto;

    const res = await app.request(`/api/category/${created.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(created);
  });

  it('404s for an unknown category id', async () => {
    const res = await app.request('/api/category/999999');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      status: 404,
      name: 'NotFoundError',
      code: 'NOT_FOUND',
    });
  });

  it('rejects a missing name with 400 before touching the database', async () => {
    const res = await postCategory({});
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate name', async () => {
    expect((await postCategory({ name: 'duplicate' })).status).toBe(201);

    // Current behavior: the unique-constraint violation isn't mapped to a
    // domain error, so it falls through to the generic 500 handler in
    // app.onError. Documented here rather than fixed -- a ConflictError
    // mapping (409) would be a reasonable follow-up, not a silent regression.
    const second = await postCategory({ name: 'duplicate' });
    expect(second.status).toBe(500);
  });

  describe('PUT /:id', () => {
    it('updates a category and returns the updated record', async () => {
      const created = (await (
        await postCategory({ name: 'old name' })
      ).json()) as CategoryDto;

      const res = await putCategory(created.id, { name: 'new name' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ...created, name: 'new name' });

      const getRes = await app.request(`/api/category/${created.id}`);
      expect(await getRes.json()).toMatchObject({ name: 'new name' });
    });

    it('404s for an unknown category id', async () => {
      const res = await putCategory(999999, { name: 'anything' });
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({
        status: 404,
        name: 'NotFoundError',
        code: 'NOT_FOUND',
      });
    });

    it('rejects a missing name with 400 before touching the database', async () => {
      const created = (await (
        await postCategory({ name: 'keep me' })
      ).json()) as CategoryDto;

      const res = await putCategory(created.id, {});
      expect(res.status).toBe(400);

      const getRes = await app.request(`/api/category/${created.id}`);
      expect(await getRes.json()).toMatchObject({ name: 'keep me' });
    });
  });

  describe('DELETE /:id', () => {
    it('deletes a category', async () => {
      const created = (await (
        await postCategory({ name: 'to delete' })
      ).json()) as CategoryDto;

      const res = await deleteCategory(created.id);
      expect(res.status).toBe(204);

      const getRes = await app.request(`/api/category/${created.id}`);
      expect(getRes.status).toBe(404);
    });

    it('404s for an unknown category id', async () => {
      const res = await deleteCategory(999999);
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({
        status: 404,
        name: 'NotFoundError',
        code: 'NOT_FOUND',
      });
    });

    it('deletes a category that still has linked subjects', async () => {
      const created = (await (
        await postCategory({ name: 'linked' })
      ).json()) as CategoryDto;
      const db = getDb();
      const [{ insertId: subjectId }] = await db
        .insert(subjectTable)
        .values({ name: 'linked subject', createdAt: new Date() });
      await db
        .insert(subjectCategoryTable)
        .values({ subjectId, categoryId: created.id });

      const res = await deleteCategory(created.id);
      expect(res.status).toBe(204);
    });
  });

  describe('admin auth gate', () => {
    it('rejects a write with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await postCategory({ name: 'blocked' });
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({
        status: 401,
        name: 'UnauthorizedError',
        code: 'UNAUTHORIZED',
      });
    });

    it('rejects a write with 403 for a non-admin email', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue('someone-else@example.com');

      const res = await postCategory({ name: 'blocked' });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({
        status: 403,
        name: 'ForbiddenError',
        code: 'FORBIDDEN',
      });
    });

    it('leaves GET ungated even with no valid identity', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await app.request('/api/category');
      expect(res.status).toBe(200);
    });
  });
});
