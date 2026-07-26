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
import { examSubjectTable, examTable, subjectTable } from 'src/db/schema';
import { ADMIN_EMAILS } from 'src/middleware/adminAuth';

// The admin gate is exercised end-to-end in its own describe block below;
// every other test just needs writes to succeed, so default the mocked
// Firebase verification to the admin identity.
vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdToken: vi.fn() }));
import { verifyIdToken } from 'src/lib/firebaseAdmin';

type ExamDto = { id: number; name: string; createdAt: string };

const postExam = (body: unknown) =>
  app.request('/api/exam', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const putExam = (id: number | string, body: unknown) =>
  app.request(`/api/exam/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const deleteExam = (id: number | string) =>
  app.request(`/api/exam/${id}`, { method: 'DELETE' });

const getExamSubject = (id: number | string) =>
  app.request(`/api/exam/${id}/subject`);

const putExamSubject = (id: number | string, body: unknown) =>
  app.request(`/api/exam/${id}/subject`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// Cleared in FK-safe order: exam_subject references both exam and subject,
// so it must go first.
const clearTables = async () => {
  const db = getDb();
  await db.delete(examSubjectTable);
  await db.delete(examTable);
  await db.delete(subjectTable);
};

describe('exam routes', () => {
  beforeAll(clearTables);

  beforeEach(() => {
    vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);
  });

  afterEach(clearTables);

  afterAll(async () => {
    await closeDb();
  });

  it('lists exams, empty when there is no data', async () => {
    const res = await app.request('/api/exam');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: [],
      paginate: { total: 0, page: 1, limit: 20, totalPages: 1 },
    });
  });

  it('creates an exam and lists it back', async () => {
    const postRes = await postExam({ name: 'SAT' });
    expect(postRes.status).toBe(201);
    const created = (await postRes.json()) as ExamDto;
    expect(created).toMatchObject({ name: 'SAT' });
    expect(created.id).toEqual(expect.any(Number));

    const listRes = await app.request('/api/exam');
    const listBody = (await listRes.json()) as {
      data: (ExamDto & { subjects: string | null })[];
    };
    expect(listBody.data).toEqual([{ ...created, subjects: null }]);
  });

  it('shows a comma-separated list of linked subject names', async () => {
    const created = (await (await postExam({ name: 'GRE' })).json()) as ExamDto;
    const db = getDb();
    const [{ insertId: mathId }] = await db
      .insert(subjectTable)
      .values({ name: 'math', createdAt: new Date() });
    const [{ insertId: verbalId }] = await db
      .insert(subjectTable)
      .values({ name: 'verbal', createdAt: new Date() });
    await db.insert(examSubjectTable).values([
      { examId: created.id, subjectId: mathId },
      { examId: created.id, subjectId: verbalId },
    ]);

    const res = await app.request('/api/exam');
    const { data } = (await res.json()) as {
      data: (ExamDto & { subjects: string | null })[];
    };
    const [examRow] = data;
    expect(examRow.subjects).toBe('math, verbal');
  });

  it('fetches an exam by id', async () => {
    const created = (await (await postExam({ name: 'LSAT' })).json()) as ExamDto;

    const res = await app.request(`/api/exam/${created.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(created);
  });

  it('404s for an unknown exam id', async () => {
    const res = await app.request('/api/exam/999999');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      status: 404,
      name: 'NotFoundError',
      code: 'NOT_FOUND',
    });
  });

  it('rejects a missing name with 400 before touching the database', async () => {
    const res = await postExam({});
    expect(res.status).toBe(400);
  });

  describe('PUT /:id', () => {
    it('updates an exam and returns the updated record', async () => {
      const created = (await (
        await postExam({ name: 'old name' })
      ).json()) as ExamDto;

      const res = await putExam(created.id, { name: 'new name' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ...created, name: 'new name' });

      const getRes = await app.request(`/api/exam/${created.id}`);
      expect(await getRes.json()).toMatchObject({ name: 'new name' });
    });

    it('404s for an unknown exam id', async () => {
      const res = await putExam(999999, { name: 'anything' });
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({
        status: 404,
        name: 'NotFoundError',
        code: 'NOT_FOUND',
      });
    });

    it('rejects a missing name with 400 before touching the database', async () => {
      const created = (await (
        await postExam({ name: 'keep me' })
      ).json()) as ExamDto;

      const res = await putExam(created.id, {});
      expect(res.status).toBe(400);

      const getRes = await app.request(`/api/exam/${created.id}`);
      expect(await getRes.json()).toMatchObject({ name: 'keep me' });
    });
  });

  describe('DELETE /:id', () => {
    it('deletes an exam', async () => {
      const created = (await (
        await postExam({ name: 'to delete' })
      ).json()) as ExamDto;

      const res = await deleteExam(created.id);
      expect(res.status).toBe(204);

      const getRes = await app.request(`/api/exam/${created.id}`);
      expect(getRes.status).toBe(404);
    });

    it('404s for an unknown exam id', async () => {
      const res = await deleteExam(999999);
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({
        status: 404,
        name: 'NotFoundError',
        code: 'NOT_FOUND',
      });
    });

    it('deletes an exam that still has linked subjects', async () => {
      const created = (await (
        await postExam({ name: 'linked' })
      ).json()) as ExamDto;
      const db = getDb();
      const [{ insertId: subjectId }] = await db
        .insert(subjectTable)
        .values({ name: 'linked subject', createdAt: new Date() });
      await db
        .insert(examSubjectTable)
        .values({ examId: created.id, subjectId });

      const res = await deleteExam(created.id);
      expect(res.status).toBe(204);
    });
  });

  describe('/:id/subject', () => {
    it('returns an empty array for an exam with no linked subjects', async () => {
      const created = (await (
        await postExam({ name: 'no links' })
      ).json()) as ExamDto;

      const res = await getExamSubject(created.id);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ subjectIds: [] });
    });

    it('404s GET for an unknown exam id', async () => {
      const res = await getExamSubject(999999);
      expect(res.status).toBe(404);
    });

    it('sets, replaces, and clears subject links', async () => {
      const exam = (await (await postExam({ name: 'ACT' })).json()) as ExamDto;
      const db = getDb();
      const [{ insertId: sub1 }] = await db
        .insert(subjectTable)
        .values({ name: 'reading', createdAt: new Date() });
      const [{ insertId: sub2 }] = await db
        .insert(subjectTable)
        .values({ name: 'writing', createdAt: new Date() });

      const setRes = await putExamSubject(exam.id, {
        subjectIds: [sub1, sub2],
      });
      expect(setRes.status).toBe(200);
      const setBody = (await setRes.json()) as { subjectIds: number[] };
      expect(setBody.subjectIds.sort()).toEqual([sub1, sub2].sort());

      const getRes = await getExamSubject(exam.id);
      const getBody = (await getRes.json()) as { subjectIds: number[] };
      expect(getBody.subjectIds.sort()).toEqual([sub1, sub2].sort());

      // Replacing with a single id should drop the other link, not add to it.
      const replaceRes = await putExamSubject(exam.id, { subjectIds: [sub1] });
      expect(await replaceRes.json()).toEqual({ subjectIds: [sub1] });

      // An empty array clears all links.
      const clearRes = await putExamSubject(exam.id, { subjectIds: [] });
      expect(await clearRes.json()).toEqual({ subjectIds: [] });
    });

    it('404s PUT for an unknown exam id', async () => {
      const res = await putExamSubject(999999, { subjectIds: [] });
      expect(res.status).toBe(404);
    });

    it('rejects a non-array subjectIds with 400', async () => {
      const exam = (await (
        await postExam({ name: 'invalid body' })
      ).json()) as ExamDto;

      const res = await putExamSubject(exam.id, { subjectIds: 1 });
      expect(res.status).toBe(400);
    });
  });

  describe('pagination and sorting', () => {
    it('paginates with limit/offset and reports page metadata', async () => {
      await postExam({ name: 'c-charlie' });
      await postExam({ name: 'a-alpha' });
      await postExam({ name: 'b-bravo' });

      const res = await app.request('/api/exam?limit=2&offset=0&sort=name');
      const body = (await res.json()) as {
        data: ExamDto[];
        paginate: { total: number; page: number; limit: number; totalPages: number };
      };
      expect(body.data).toHaveLength(2);
      expect(body.paginate).toEqual({
        total: 3,
        page: 1,
        limit: 2,
        totalPages: 2,
      });

      const page2 = await app.request('/api/exam?limit=2&offset=2&sort=name');
      const page2Body = (await page2.json()) as { data: ExamDto[] };
      expect(page2Body.data).toHaveLength(1);
    });

    it('sorts by name ascending and descending', async () => {
      await postExam({ name: 'c-charlie' });
      await postExam({ name: 'a-alpha' });
      await postExam({ name: 'b-bravo' });

      const ascRes = await app.request('/api/exam?sort=name&order=asc');
      const ascBody = (await ascRes.json()) as { data: ExamDto[] };
      expect(ascBody.data.map((e) => e.name)).toEqual([
        'a-alpha',
        'b-bravo',
        'c-charlie',
      ]);

      const descRes = await app.request('/api/exam?sort=name&order=desc');
      const descBody = (await descRes.json()) as { data: ExamDto[] };
      expect(descBody.data.map((e) => e.name)).toEqual([
        'c-charlie',
        'b-bravo',
        'a-alpha',
      ]);
    });

    it('rejects an out-of-range limit with 400', async () => {
      const res = await app.request('/api/exam?limit=99999');
      expect(res.status).toBe(400);
    });

    it('rejects an invalid sort column with 400', async () => {
      const res = await app.request('/api/exam?sort=bogus');
      expect(res.status).toBe(400);
    });
  });

  describe('admin auth gate', () => {
    it('rejects a write with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await postExam({ name: 'blocked' });
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({
        status: 401,
        name: 'UnauthorizedError',
        code: 'UNAUTHORIZED',
      });
    });

    it('rejects a write with 403 for a non-admin email', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue('someone-else@example.com');

      const res = await postExam({ name: 'blocked' });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({
        status: 403,
        name: 'ForbiddenError',
        code: 'FORBIDDEN',
      });
    });

    it('gates the /:id/subject relation write the same way', async () => {
      const exam = (await (
        await postExam({ name: 'gated relation' })
      ).json()) as ExamDto;

      vi.mocked(verifyIdToken).mockResolvedValue(null);
      const res = await putExamSubject(exam.id, { subjectIds: [] });
      expect(res.status).toBe(401);
    });

    it('leaves GET ungated even with no valid identity', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await app.request('/api/exam');
      expect(res.status).toBe(200);
    });
  });
});
