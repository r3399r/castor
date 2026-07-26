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
import { subjectTable, tagTable } from 'src/db/schema';
import { ADMIN_EMAILS } from 'src/middleware/adminAuth';

// The admin gate is exercised end-to-end in its own describe block below;
// every other test just needs writes to succeed, so default the mocked
// Firebase verification to the admin identity.
vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdToken: vi.fn() }));
import { verifyIdToken } from 'src/lib/firebaseAdmin';

type TagDto = {
  id: number;
  name: string;
  subjectId: number;
  createdAt: string;
};
type SubjectDto = { id: number; name: string };

const postSubject = async (name: string) => {
  const res = await app.request('/api/subject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return (await res.json()) as SubjectDto;
};

const postTag = (body: unknown) =>
  app.request('/api/tag', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const putTag = (id: number | string, body: unknown) =>
  app.request(`/api/tag/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const deleteTag = (id: number | string) =>
  app.request(`/api/tag/${id}`, { method: 'DELETE' });

// Cleared in FK-safe order: tag references subject, so it must go first.
const clearTables = async () => {
  const db = getDb();
  await db.delete(tagTable);
  await db.delete(subjectTable);
};

describe('tag routes', () => {
  beforeAll(clearTables);

  beforeEach(() => {
    vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);
  });

  afterEach(clearTables);

  afterAll(async () => {
    await closeDb();
  });

  it('lists tags, empty when there is no data', async () => {
    const res = await app.request('/api/tag');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('creates a tag and lists it back', async () => {
    const subject = await postSubject('algebra');

    const postRes = await postTag({ name: 'linear-equations', subjectId: subject.id });
    expect(postRes.status).toBe(201);
    const created = (await postRes.json()) as TagDto;
    expect(created).toMatchObject({
      name: 'linear-equations',
      subjectId: subject.id,
    });
    expect(created.id).toEqual(expect.any(Number));

    const listRes = await app.request('/api/tag');
    expect(await listRes.json()).toEqual([created]);
  });

  it('fetches a tag by id', async () => {
    const subject = await postSubject('biology');
    const created = (await (
      await postTag({ name: 'genetics', subjectId: subject.id })
    ).json()) as TagDto;

    const res = await app.request(`/api/tag/${created.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(created);
  });

  it('404s for an unknown tag id', async () => {
    const res = await app.request('/api/tag/999999');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      status: 404,
      name: 'NotFoundError',
      code: 'NOT_FOUND',
    });
  });

  it('rejects a missing name with 400 before touching the database', async () => {
    const subject = await postSubject('chemistry');
    const res = await postTag({ subjectId: subject.id });
    expect(res.status).toBe(400);
  });

  it('rejects a missing subjectId with 400 before touching the database', async () => {
    const res = await postTag({ name: 'orphaned' });
    expect(res.status).toBe(400);
  });

  describe('PUT /:id', () => {
    it('updates a tag and returns the updated record', async () => {
      const subjectA = await postSubject('physics');
      const subjectB = await postSubject('astronomy');
      const created = (await (
        await postTag({ name: 'old name', subjectId: subjectA.id })
      ).json()) as TagDto;

      const res = await putTag(created.id, {
        name: 'new name',
        subjectId: subjectB.id,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        ...created,
        name: 'new name',
        subjectId: subjectB.id,
      });

      const getRes = await app.request(`/api/tag/${created.id}`);
      expect(await getRes.json()).toMatchObject({
        name: 'new name',
        subjectId: subjectB.id,
      });
    });

    it('404s for an unknown tag id', async () => {
      const subject = await postSubject('history');
      const res = await putTag(999999, {
        name: 'anything',
        subjectId: subject.id,
      });
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({
        status: 404,
        name: 'NotFoundError',
        code: 'NOT_FOUND',
      });
    });

    it('rejects a missing name with 400 before touching the database', async () => {
      const subject = await postSubject('geography');
      const created = (await (
        await postTag({ name: 'keep me', subjectId: subject.id })
      ).json()) as TagDto;

      const res = await putTag(created.id, { subjectId: subject.id });
      expect(res.status).toBe(400);

      const getRes = await app.request(`/api/tag/${created.id}`);
      expect(await getRes.json()).toMatchObject({ name: 'keep me' });
    });
  });

  describe('DELETE /:id', () => {
    it('deletes a tag', async () => {
      const subject = await postSubject('literature');
      const created = (await (
        await postTag({ name: 'to delete', subjectId: subject.id })
      ).json()) as TagDto;

      const res = await deleteTag(created.id);
      expect(res.status).toBe(204);

      const getRes = await app.request(`/api/tag/${created.id}`);
      expect(getRes.status).toBe(404);
    });

    it('404s for an unknown tag id', async () => {
      const res = await deleteTag(999999);
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({
        status: 404,
        name: 'NotFoundError',
        code: 'NOT_FOUND',
      });
    });
  });

  describe('admin auth gate', () => {
    it('rejects a write with 401 when there is no valid identity', async () => {
      const subject = await postSubject('economics');
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await postTag({ name: 'blocked', subjectId: subject.id });
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({
        status: 401,
        name: 'UnauthorizedError',
        code: 'UNAUTHORIZED',
      });
    });

    it('rejects a write with 403 for a non-admin email', async () => {
      const subject = await postSubject('psychology');
      vi.mocked(verifyIdToken).mockResolvedValue('someone-else@example.com');

      const res = await postTag({ name: 'blocked', subjectId: subject.id });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({
        status: 403,
        name: 'ForbiddenError',
        code: 'FORBIDDEN',
      });
    });

    it('leaves GET ungated even with no valid identity', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await app.request('/api/tag');
      expect(res.status).toBe(200);
    });
  });
});
