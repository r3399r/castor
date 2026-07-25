import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
import { categoryTable } from 'src/db/schema';

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

describe('category routes', () => {
  beforeAll(async () => {
    await getDb().delete(categoryTable);
  });

  afterEach(async () => {
    await getDb().delete(categoryTable);
  });

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
  });
});
