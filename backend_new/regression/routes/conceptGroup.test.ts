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
import { conceptGroupTable, subjectTable } from 'src/db/schema';
import { ADMIN_EMAILS } from 'src/middleware/adminAuth';

// The admin gate is exercised end-to-end in its own describe block below;
// every other test just needs writes to succeed, so default the mocked
// Firebase verification to the admin identity.
vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdToken: vi.fn() }));
import { verifyIdToken } from 'src/lib/firebaseAdmin';

type ConceptGroupDto = {
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

const postConceptGroup = (body: unknown) =>
  app.request('/api/concept-group', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const putConceptGroup = (id: number | string, body: unknown) =>
  app.request(`/api/concept-group/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const deleteConceptGroup = (id: number | string) =>
  app.request(`/api/concept-group/${id}`, { method: 'DELETE' });

// Cleared in FK-safe order: concept_group references subject, so it must
// go first.
const clearTables = async () => {
  const db = getDb();
  await db.delete(conceptGroupTable);
  await db.delete(subjectTable);
};

describe('concept-group routes', () => {
  beforeAll(clearTables);

  beforeEach(() => {
    vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);
  });

  afterEach(clearTables);

  afterAll(async () => {
    await closeDb();
  });

  it('lists concept groups, empty when there is no data', async () => {
    const res = await app.request('/api/concept-group');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: [],
      paginate: { total: 0, page: 1, limit: 20, totalPages: 1 },
    });
  });

  it('creates a concept group and lists it back', async () => {
    const subject = await postSubject('algebra');

    const postRes = await postConceptGroup({
      name: 'linear equations',
      subjectId: subject.id,
    });
    expect(postRes.status).toBe(201);
    const created = (await postRes.json()) as ConceptGroupDto;
    expect(created).toMatchObject({
      name: 'linear equations',
      subjectId: subject.id,
    });
    expect(created.id).toEqual(expect.any(Number));

    const listRes = await app.request('/api/concept-group');
    const listBody = (await listRes.json()) as { data: ConceptGroupDto[] };
    expect(listBody.data).toEqual([created]);
  });

  it('fetches a concept group by id', async () => {
    const subject = await postSubject('biology');
    const created = (await (
      await postConceptGroup({ name: 'genetics', subjectId: subject.id })
    ).json()) as ConceptGroupDto;

    const res = await app.request(`/api/concept-group/${created.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(created);
  });

  it('404s for an unknown concept group id', async () => {
    const res = await app.request('/api/concept-group/999999');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      status: 404,
      name: 'NotFoundError',
      code: 'NOT_FOUND',
    });
  });

  it('rejects a missing name with 400 before touching the database', async () => {
    const subject = await postSubject('chemistry');
    const res = await postConceptGroup({ subjectId: subject.id });
    expect(res.status).toBe(400);
  });

  it('rejects a missing subjectId with 400 before touching the database', async () => {
    const res = await postConceptGroup({ name: 'orphaned' });
    expect(res.status).toBe(400);
  });

  describe('PUT /:id', () => {
    it('updates a concept group and returns the updated record', async () => {
      const subjectA = await postSubject('physics');
      const subjectB = await postSubject('astronomy');
      const created = (await (
        await postConceptGroup({ name: 'old name', subjectId: subjectA.id })
      ).json()) as ConceptGroupDto;

      const res = await putConceptGroup(created.id, {
        name: 'new name',
        subjectId: subjectB.id,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        ...created,
        name: 'new name',
        subjectId: subjectB.id,
      });

      const getRes = await app.request(`/api/concept-group/${created.id}`);
      expect(await getRes.json()).toMatchObject({
        name: 'new name',
        subjectId: subjectB.id,
      });
    });

    it('404s for an unknown concept group id', async () => {
      const subject = await postSubject('history');
      const res = await putConceptGroup(999999, {
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
        await postConceptGroup({ name: 'keep me', subjectId: subject.id })
      ).json()) as ConceptGroupDto;

      const res = await putConceptGroup(created.id, { subjectId: subject.id });
      expect(res.status).toBe(400);

      const getRes = await app.request(`/api/concept-group/${created.id}`);
      expect(await getRes.json()).toMatchObject({ name: 'keep me' });
    });
  });

  describe('DELETE /:id', () => {
    it('deletes a concept group', async () => {
      const subject = await postSubject('literature');
      const created = (await (
        await postConceptGroup({ name: 'to delete', subjectId: subject.id })
      ).json()) as ConceptGroupDto;

      const res = await deleteConceptGroup(created.id);
      expect(res.status).toBe(204);

      const getRes = await app.request(`/api/concept-group/${created.id}`);
      expect(getRes.status).toBe(404);
    });

    it('404s for an unknown concept group id', async () => {
      const res = await deleteConceptGroup(999999);
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({
        status: 404,
        name: 'NotFoundError',
        code: 'NOT_FOUND',
      });
    });
  });

  describe('pagination and sorting', () => {
    it('paginates with limit/offset and reports page metadata', async () => {
      const subject = await postSubject('paging subject');
      await postConceptGroup({ name: 'c-charlie', subjectId: subject.id });
      await postConceptGroup({ name: 'a-alpha', subjectId: subject.id });
      await postConceptGroup({ name: 'b-bravo', subjectId: subject.id });

      const res = await app.request(
        '/api/concept-group?limit=2&offset=0&sort=name'
      );
      const body = (await res.json()) as {
        data: ConceptGroupDto[];
        paginate: { total: number; page: number; limit: number; totalPages: number };
      };
      expect(body.data).toHaveLength(2);
      expect(body.paginate).toEqual({
        total: 3,
        page: 1,
        limit: 2,
        totalPages: 2,
      });

      const page2 = await app.request(
        '/api/concept-group?limit=2&offset=2&sort=name'
      );
      const page2Body = (await page2.json()) as { data: ConceptGroupDto[] };
      expect(page2Body.data).toHaveLength(1);
    });

    it('sorts by name ascending and descending', async () => {
      const subject = await postSubject('sorting subject');
      await postConceptGroup({ name: 'c-charlie', subjectId: subject.id });
      await postConceptGroup({ name: 'a-alpha', subjectId: subject.id });
      await postConceptGroup({ name: 'b-bravo', subjectId: subject.id });

      const ascRes = await app.request(
        '/api/concept-group?sort=name&order=asc'
      );
      const ascBody = (await ascRes.json()) as { data: ConceptGroupDto[] };
      expect(ascBody.data.map((cg) => cg.name)).toEqual([
        'a-alpha',
        'b-bravo',
        'c-charlie',
      ]);

      const descRes = await app.request(
        '/api/concept-group?sort=name&order=desc'
      );
      const descBody = (await descRes.json()) as { data: ConceptGroupDto[] };
      expect(descBody.data.map((cg) => cg.name)).toEqual([
        'c-charlie',
        'b-bravo',
        'a-alpha',
      ]);
    });

    it('sorts by the linked subject name', async () => {
      const subjectZ = await postSubject('z-subject');
      const subjectA = await postSubject('a-subject');
      await postConceptGroup({ name: 'cg-on-z', subjectId: subjectZ.id });
      await postConceptGroup({ name: 'cg-on-a', subjectId: subjectA.id });

      const res = await app.request(
        '/api/concept-group?sort=subject&order=asc'
      );
      const body = (await res.json()) as { data: ConceptGroupDto[] };
      expect(body.data.map((cg) => cg.subjectId)).toEqual([
        subjectA.id,
        subjectZ.id,
      ]);
    });

    it('rejects an out-of-range limit with 400', async () => {
      const res = await app.request('/api/concept-group?limit=99999');
      expect(res.status).toBe(400);
    });

    it('rejects an invalid sort column with 400', async () => {
      const res = await app.request('/api/concept-group?sort=bogus');
      expect(res.status).toBe(400);
    });
  });

  describe('admin auth gate', () => {
    it('rejects a write with 401 when there is no valid identity', async () => {
      const subject = await postSubject('economics');
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await postConceptGroup({
        name: 'blocked',
        subjectId: subject.id,
      });
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

      const res = await postConceptGroup({
        name: 'blocked',
        subjectId: subject.id,
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({
        status: 403,
        name: 'ForbiddenError',
        code: 'FORBIDDEN',
      });
    });

    it('leaves GET ungated even with no valid identity', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await app.request('/api/concept-group');
      expect(res.status).toBe(200);
    });
  });
});
