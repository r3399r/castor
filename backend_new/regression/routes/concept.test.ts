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
import { eq } from 'drizzle-orm';
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
import { conceptGroupTable, conceptTable, subjectTable } from 'src/db/schema';
import { ADMIN_EMAILS } from 'src/middleware/adminAuth';

// The admin gate is exercised end-to-end in its own describe block below;
// every other test just needs writes to succeed, so default the mocked
// Firebase verification to the admin identity.
vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdToken: vi.fn() }));
import { verifyIdToken } from 'src/lib/firebaseAdmin';

type ConceptDto = {
  id: number;
  name: string;
  conceptGroupId: number;
  numberOfQuestions: number;
  createdAt: string;
};
type SubjectDto = { id: number; name: string };
type ConceptGroupDto = { id: number; name: string; subjectId: number };

const postSubject = async (name: string) => {
  const res = await app.request('/api/subject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return (await res.json()) as SubjectDto;
};

const postConceptGroup = async (name: string, subjectId: number) => {
  const res = await app.request('/api/concept-group', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, subjectId }),
  });
  return (await res.json()) as ConceptGroupDto;
};

const postConcept = (body: unknown) =>
  app.request('/api/concept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const putConcept = (id: number | string, body: unknown) =>
  app.request(`/api/concept/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const deleteConcept = (id: number | string) =>
  app.request(`/api/concept/${id}`, { method: 'DELETE' });

// Cleared in FK-safe order: concept references concept_group, which
// references subject.
const clearTables = async () => {
  const db = getDb();
  await db.delete(conceptTable);
  await db.delete(conceptGroupTable);
  await db.delete(subjectTable);
};

describe('concept routes', () => {
  beforeAll(clearTables);

  beforeEach(() => {
    vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);
  });

  afterEach(clearTables);

  afterAll(async () => {
    await closeDb();
  });

  it('lists concepts, empty when there is no data', async () => {
    const res = await app.request('/api/concept');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: [],
      paginate: { total: 0, page: 1, limit: 20, totalPages: 1 },
    });
  });

  it('creates a concept with numberOfQuestions defaulting to 0 and lists it back', async () => {
    const subject = await postSubject('math');
    const conceptGroup = await postConceptGroup('algebra', subject.id);

    const postRes = await postConcept({
      name: 'linear equations',
      conceptGroupId: conceptGroup.id,
    });
    expect(postRes.status).toBe(201);
    const created = (await postRes.json()) as ConceptDto;
    expect(created).toMatchObject({
      name: 'linear equations',
      conceptGroupId: conceptGroup.id,
      numberOfQuestions: 0,
    });
    expect(created.id).toEqual(expect.any(Number));

    const listRes = await app.request('/api/concept');
    const listBody = (await listRes.json()) as { data: ConceptDto[] };
    expect(listBody.data).toEqual([created]);
  });

  it('ignores an attempted numberOfQuestions override on create', async () => {
    const subject = await postSubject('physics');
    const conceptGroup = await postConceptGroup('mechanics', subject.id);

    const res = await postConcept({
      name: 'kinematics',
      conceptGroupId: conceptGroup.id,
      numberOfQuestions: 999,
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as ConceptDto;
    expect(created.numberOfQuestions).toBe(0);
  });

  it('fetches a concept by id', async () => {
    const subject = await postSubject('biology');
    const conceptGroup = await postConceptGroup('genetics', subject.id);
    const created = (await (
      await postConcept({ name: 'alleles', conceptGroupId: conceptGroup.id })
    ).json()) as ConceptDto;

    const res = await app.request(`/api/concept/${created.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(created);
  });

  it('404s for an unknown concept id', async () => {
    const res = await app.request('/api/concept/999999');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      status: 404,
      name: 'NotFoundError',
      code: 'NOT_FOUND',
    });
  });

  it('rejects a missing name with 400 before touching the database', async () => {
    const subject = await postSubject('chemistry');
    const conceptGroup = await postConceptGroup('bonds', subject.id);
    const res = await postConcept({ conceptGroupId: conceptGroup.id });
    expect(res.status).toBe(400);
  });

  it('rejects a missing conceptGroupId with 400 before touching the database', async () => {
    const res = await postConcept({ name: 'orphaned' });
    expect(res.status).toBe(400);
  });

  describe('PUT /:id', () => {
    it('updates a concept and returns the updated record', async () => {
      const subject = await postSubject('history');
      const groupA = await postConceptGroup('ww1', subject.id);
      const groupB = await postConceptGroup('ww2', subject.id);
      const created = (await (
        await postConcept({ name: 'old name', conceptGroupId: groupA.id })
      ).json()) as ConceptDto;

      const res = await putConcept(created.id, {
        name: 'new name',
        conceptGroupId: groupB.id,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        ...created,
        name: 'new name',
        conceptGroupId: groupB.id,
      });

      const getRes = await app.request(`/api/concept/${created.id}`);
      expect(await getRes.json()).toMatchObject({
        name: 'new name',
        conceptGroupId: groupB.id,
      });
    });

    it('ignores an attempted numberOfQuestions override on update', async () => {
      const subject = await postSubject('geography');
      const conceptGroup = await postConceptGroup('rivers', subject.id);
      const created = (await (
        await postConcept({ name: 'amazon', conceptGroupId: conceptGroup.id })
      ).json()) as ConceptDto;

      const res = await putConcept(created.id, {
        name: 'amazon',
        conceptGroupId: conceptGroup.id,
        numberOfQuestions: 500,
      });
      expect(res.status).toBe(200);
      const updated = (await res.json()) as ConceptDto;
      expect(updated.numberOfQuestions).toBe(0);
    });

    it('404s for an unknown concept id', async () => {
      const subject = await postSubject('economics');
      const conceptGroup = await postConceptGroup('supply-demand', subject.id);
      const res = await putConcept(999999, {
        name: 'anything',
        conceptGroupId: conceptGroup.id,
      });
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({
        status: 404,
        name: 'NotFoundError',
        code: 'NOT_FOUND',
      });
    });

    it('rejects a missing name with 400 before touching the database', async () => {
      const subject = await postSubject('literature');
      const conceptGroup = await postConceptGroup('poetry', subject.id);
      const created = (await (
        await postConcept({ name: 'keep me', conceptGroupId: conceptGroup.id })
      ).json()) as ConceptDto;

      const res = await putConcept(created.id, {
        conceptGroupId: conceptGroup.id,
      });
      expect(res.status).toBe(400);

      const getRes = await app.request(`/api/concept/${created.id}`);
      expect(await getRes.json()).toMatchObject({ name: 'keep me' });
    });
  });

  describe('DELETE /:id', () => {
    it('deletes a concept', async () => {
      const subject = await postSubject('psychology');
      const conceptGroup = await postConceptGroup('cognition', subject.id);
      const created = (await (
        await postConcept({ name: 'to delete', conceptGroupId: conceptGroup.id })
      ).json()) as ConceptDto;

      const res = await deleteConcept(created.id);
      expect(res.status).toBe(204);

      const getRes = await app.request(`/api/concept/${created.id}`);
      expect(getRes.status).toBe(404);
    });

    it('404s for an unknown concept id', async () => {
      const res = await deleteConcept(999999);
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
      const conceptGroup = await postConceptGroup('paging group', subject.id);
      await postConcept({ name: 'c-charlie', conceptGroupId: conceptGroup.id });
      await postConcept({ name: 'a-alpha', conceptGroupId: conceptGroup.id });
      await postConcept({ name: 'b-bravo', conceptGroupId: conceptGroup.id });

      const res = await app.request('/api/concept?limit=2&offset=0&sort=name');
      const body = (await res.json()) as {
        data: ConceptDto[];
        paginate: { total: number; page: number; limit: number; totalPages: number };
      };
      expect(body.data).toHaveLength(2);
      expect(body.paginate).toEqual({
        total: 3,
        page: 1,
        limit: 2,
        totalPages: 2,
      });

      const page2 = await app.request('/api/concept?limit=2&offset=2&sort=name');
      const page2Body = (await page2.json()) as { data: ConceptDto[] };
      expect(page2Body.data).toHaveLength(1);
    });

    it('sorts by name ascending and descending', async () => {
      const subject = await postSubject('sorting subject');
      const conceptGroup = await postConceptGroup('sorting group', subject.id);
      await postConcept({ name: 'c-charlie', conceptGroupId: conceptGroup.id });
      await postConcept({ name: 'a-alpha', conceptGroupId: conceptGroup.id });
      await postConcept({ name: 'b-bravo', conceptGroupId: conceptGroup.id });

      const ascRes = await app.request('/api/concept?sort=name&order=asc');
      const ascBody = (await ascRes.json()) as { data: ConceptDto[] };
      expect(ascBody.data.map((c) => c.name)).toEqual([
        'a-alpha',
        'b-bravo',
        'c-charlie',
      ]);

      const descRes = await app.request('/api/concept?sort=name&order=desc');
      const descBody = (await descRes.json()) as { data: ConceptDto[] };
      expect(descBody.data.map((c) => c.name)).toEqual([
        'c-charlie',
        'b-bravo',
        'a-alpha',
      ]);
    });

    it('sorts by the linked concept group name', async () => {
      const subject = await postSubject('z-subject');
      const groupZ = await postConceptGroup('z-group', subject.id);
      const groupA = await postConceptGroup('a-group', subject.id);
      await postConcept({ name: 'concept-on-z', conceptGroupId: groupZ.id });
      await postConcept({ name: 'concept-on-a', conceptGroupId: groupA.id });

      const res = await app.request('/api/concept?sort=conceptGroup&order=asc');
      const body = (await res.json()) as { data: ConceptDto[] };
      expect(body.data.map((c) => c.conceptGroupId)).toEqual([
        groupA.id,
        groupZ.id,
      ]);
    });

    it('sorts by numberOfQuestions', async () => {
      const subject = await postSubject('stats subject');
      const conceptGroup = await postConceptGroup('stats group', subject.id);
      const low = (await (
        await postConcept({ name: 'low', conceptGroupId: conceptGroup.id })
      ).json()) as ConceptDto;
      const high = (await (
        await postConcept({ name: 'high', conceptGroupId: conceptGroup.id })
      ).json()) as ConceptDto;

      const db = getDb();
      await db
        .update(conceptTable)
        .set({ numberOfQuestions: 10 })
        .where(eq(conceptTable.id, high.id));

      const res = await app.request(
        '/api/concept?sort=numberOfQuestions&order=desc'
      );
      const body = (await res.json()) as { data: ConceptDto[] };
      expect(body.data.map((c) => c.id)).toEqual([high.id, low.id]);
    });

    it('rejects an out-of-range limit with 400', async () => {
      const res = await app.request('/api/concept?limit=99999');
      expect(res.status).toBe(400);
    });

    it('rejects an invalid sort column with 400', async () => {
      const res = await app.request('/api/concept?sort=bogus');
      expect(res.status).toBe(400);
    });
  });

  describe('admin auth gate', () => {
    it('rejects a write with 401 when there is no valid identity', async () => {
      const subject = await postSubject('economics-gate');
      const conceptGroup = await postConceptGroup('gate-group', subject.id);
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await postConcept({
        name: 'blocked',
        conceptGroupId: conceptGroup.id,
      });
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({
        status: 401,
        name: 'UnauthorizedError',
        code: 'UNAUTHORIZED',
      });
    });

    it('rejects a write with 403 for a non-admin email', async () => {
      const subject = await postSubject('psychology-gate');
      const conceptGroup = await postConceptGroup('gate-group-2', subject.id);
      vi.mocked(verifyIdToken).mockResolvedValue('someone-else@example.com');

      const res = await postConcept({
        name: 'blocked',
        conceptGroupId: conceptGroup.id,
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

      const res = await app.request('/api/concept');
      expect(res.status).toBe(200);
    });
  });
});
