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
  conceptGroupTable,
  conceptTable,
  examSubjectTable,
  examTable,
  subjectCategoryTable,
  subjectTable,
} from 'src/db/schema';
import { ADMIN_EMAILS } from 'src/middleware/adminAuth';

// The admin gate is exercised end-to-end in its own describe block below;
// every other test just needs writes to succeed, so default the mocked
// Firebase verification to the admin identity.
vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdToken: vi.fn() }));
import { verifyIdToken } from 'src/lib/firebaseAdmin';

type SubjectDto = {
  id: number;
  name: string;
  sortOrder: number;
  createdAt: string;
};

const postSubject = (body: unknown) =>
  app.request('/api/subject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const putSubject = (id: number | string, body: unknown) =>
  app.request(`/api/subject/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const deleteSubject = (id: number | string) =>
  app.request(`/api/subject/${id}`, { method: 'DELETE' });

const getSubjectCategory = (id: number | string) =>
  app.request(`/api/subject/${id}/category`);

const putSubjectCategory = (id: number | string, body: unknown) =>
  app.request(`/api/subject/${id}/category`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// Cleared in FK-safe order: subject_category and exam_subject both
// reference subject, so they must go first; concept references
// concept_group which references subject, so those go first too.
const clearTables = async () => {
  const db = getDb();
  await db.delete(subjectCategoryTable);
  await db.delete(examSubjectTable);
  await db.delete(conceptTable);
  await db.delete(conceptGroupTable);
  await db.delete(subjectTable);
  await db.delete(categoryTable);
  await db.delete(examTable);
};

describe('subject routes', () => {
  beforeAll(clearTables);

  beforeEach(() => {
    vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);
  });

  afterEach(clearTables);

  afterAll(async () => {
    await closeDb();
  });

  it('lists subjects, empty when there is no data', async () => {
    const res = await app.request('/api/subject');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: [],
      paginate: { total: 0, page: 1, limit: 20, totalPages: 1 },
    });
  });

  it('creates a subject with a default sortOrder and lists it back', async () => {
    const postRes = await postSubject({ name: 'algebra' });
    expect(postRes.status).toBe(201);
    const created = (await postRes.json()) as SubjectDto;
    expect(created).toMatchObject({ name: 'algebra', sortOrder: 0 });
    expect(created.id).toEqual(expect.any(Number));

    const listRes = await app.request('/api/subject');
    const listBody = (await listRes.json()) as {
      data: (SubjectDto & { categories: string | null; concepts: string | null })[];
    };
    expect(listBody.data).toEqual([
      { ...created, categories: null, concepts: null },
    ]);
  });

  it('shows a comma-separated list of linked category names', async () => {
    const created = (await (
      await postSubject({ name: 'chemistry' })
    ).json()) as SubjectDto;
    const db = getDb();
    const [{ insertId: examCatId }] = await db
      .insert(categoryTable)
      .values({ name: 'science', createdAt: new Date() });
    const [{ insertId: examPrepCatId }] = await db
      .insert(categoryTable)
      .values({ name: 'exam prep', createdAt: new Date() });
    await db.insert(subjectCategoryTable).values([
      { subjectId: created.id, categoryId: examCatId },
      { subjectId: created.id, categoryId: examPrepCatId },
    ]);

    const res = await app.request('/api/subject');
    const { data } = (await res.json()) as {
      data: (SubjectDto & { categories: string | null })[];
    };
    expect(data[0].categories).toBe('exam prep, science');
  });

  it('shows a "name=id" CSV of every concept under the subject, across concept groups', async () => {
    const created = (await (
      await postSubject({ name: 'calculus' })
    ).json()) as SubjectDto;
    const db = getDb();
    const [{ insertId: groupA }] = await db
      .insert(conceptGroupTable)
      .values({ name: 'limits', subjectId: created.id });
    const [{ insertId: groupB }] = await db
      .insert(conceptGroupTable)
      .values({ name: 'integrals', subjectId: created.id });
    const [{ insertId: conceptA }] = await db
      .insert(conceptTable)
      .values({ name: '極限', conceptGroupId: groupA });
    const [{ insertId: conceptB }] = await db
      .insert(conceptTable)
      .values({ name: '積分', conceptGroupId: groupB });

    const res = await app.request('/api/subject');
    const { data } = (await res.json()) as {
      data: (SubjectDto & { concepts: string | null })[];
    };
    expect(data[0].concepts).toBe(`極限=${conceptA},積分=${conceptB}`);
  });

  it('does not let unrelated concepts under other subjects leak into the CSV', async () => {
    const created = (await (
      await postSubject({ name: 'no concepts here' })
    ).json()) as SubjectDto;
    const other = (await (
      await postSubject({ name: 'has concepts' })
    ).json()) as SubjectDto;
    const db = getDb();
    const [{ insertId: groupId }] = await db
      .insert(conceptGroupTable)
      .values({ name: 'group', subjectId: other.id });
    await db
      .insert(conceptTable)
      .values({ name: 'unrelated', conceptGroupId: groupId });

    const res = await app.request('/api/subject?sort=name&order=asc');
    const { data } = (await res.json()) as {
      data: (SubjectDto & { concepts: string | null })[];
    };
    const target = data.find((s) => s.id === created.id);
    expect(target?.concepts).toBeNull();
  });

  it('lists subjects ordered by sortOrder', async () => {
    const second = (await (
      await postSubject({ name: 'geometry', sortOrder: 2 })
    ).json()) as SubjectDto;
    const first = (await (
      await postSubject({ name: 'arithmetic', sortOrder: 1 })
    ).json()) as SubjectDto;

    const res = await app.request('/api/subject');
    const { data } = (await res.json()) as { data: SubjectDto[] };
    expect(data.map((s) => s.id)).toEqual([first.id, second.id]);
  });

  it('fetches a subject by id', async () => {
    const created = (await (
      await postSubject({ name: 'biology' })
    ).json()) as SubjectDto;

    const res = await app.request(`/api/subject/${created.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(created);
  });

  it('404s for an unknown subject id', async () => {
    const res = await app.request('/api/subject/999999');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      status: 404,
      name: 'NotFoundError',
      code: 'NOT_FOUND',
    });
  });

  it('rejects a missing name with 400 before touching the database', async () => {
    const res = await postSubject({});
    expect(res.status).toBe(400);
  });

  describe('PUT /:id', () => {
    it('updates a subject and returns the updated record', async () => {
      const created = (await (
        await postSubject({ name: 'old name', sortOrder: 1 })
      ).json()) as SubjectDto;

      const res = await putSubject(created.id, {
        name: 'new name',
        sortOrder: 5,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        ...created,
        name: 'new name',
        sortOrder: 5,
      });

      const getRes = await app.request(`/api/subject/${created.id}`);
      expect(await getRes.json()).toMatchObject({
        name: 'new name',
        sortOrder: 5,
      });
    });

    it('404s for an unknown subject id', async () => {
      const res = await putSubject(999999, { name: 'anything' });
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({
        status: 404,
        name: 'NotFoundError',
        code: 'NOT_FOUND',
      });
    });

    it('rejects a missing name with 400 before touching the database', async () => {
      const created = (await (
        await postSubject({ name: 'keep me' })
      ).json()) as SubjectDto;

      const res = await putSubject(created.id, {});
      expect(res.status).toBe(400);

      const getRes = await app.request(`/api/subject/${created.id}`);
      expect(await getRes.json()).toMatchObject({ name: 'keep me' });
    });
  });

  describe('DELETE /:id', () => {
    it('deletes a subject', async () => {
      const created = (await (
        await postSubject({ name: 'to delete' })
      ).json()) as SubjectDto;

      const res = await deleteSubject(created.id);
      expect(res.status).toBe(204);

      const getRes = await app.request(`/api/subject/${created.id}`);
      expect(getRes.status).toBe(404);
    });

    it('404s for an unknown subject id', async () => {
      const res = await deleteSubject(999999);
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({
        status: 404,
        name: 'NotFoundError',
        code: 'NOT_FOUND',
      });
    });

    it('deletes a subject that still has linked categories', async () => {
      const created = (await (
        await postSubject({ name: 'linked' })
      ).json()) as SubjectDto;
      const db = getDb();
      const [{ insertId: catId }] = await db
        .insert(categoryTable)
        .values({ name: 'linked category', createdAt: new Date() });
      await db
        .insert(subjectCategoryTable)
        .values({ subjectId: created.id, categoryId: catId });

      const res = await deleteSubject(created.id);
      expect(res.status).toBe(204);
    });

    it('deletes a subject that still has linked exams', async () => {
      const created = (await (
        await postSubject({ name: 'exam-linked' })
      ).json()) as SubjectDto;
      const db = getDb();
      const [{ insertId: examId }] = await db
        .insert(examTable)
        .values({ name: 'linked exam', createdAt: new Date() });
      await db
        .insert(examSubjectTable)
        .values({ examId, subjectId: created.id });

      const res = await deleteSubject(created.id);
      expect(res.status).toBe(204);
    });
  });

  describe('/:id/category', () => {
    it('returns an empty array for a subject with no linked categories', async () => {
      const created = (await (
        await postSubject({ name: 'no links' })
      ).json()) as SubjectDto;

      const res = await getSubjectCategory(created.id);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ categoryIds: [] });
    });

    it('404s GET for an unknown subject id', async () => {
      const res = await getSubjectCategory(999999);
      expect(res.status).toBe(404);
    });

    it('sets, replaces, and clears category links', async () => {
      const subject = (await (
        await postSubject({ name: 'physics' })
      ).json()) as SubjectDto;
      const db = getDb();
      const [{ insertId: cat1 }] = await db
        .insert(categoryTable)
        .values({ name: 'science', createdAt: new Date() });
      const [{ insertId: cat2 }] = await db
        .insert(categoryTable)
        .values({ name: 'exam prep', createdAt: new Date() });

      const setRes = await putSubjectCategory(subject.id, {
        categoryIds: [cat1, cat2],
      });
      expect(setRes.status).toBe(200);
      const setBody = (await setRes.json()) as { categoryIds: number[] };
      expect(setBody.categoryIds.sort()).toEqual([cat1, cat2].sort());

      const getRes = await getSubjectCategory(subject.id);
      const getBody = (await getRes.json()) as { categoryIds: number[] };
      expect(getBody.categoryIds.sort()).toEqual([cat1, cat2].sort());

      // Replacing with a single id should drop the other link, not add to it.
      const replaceRes = await putSubjectCategory(subject.id, {
        categoryIds: [cat1],
      });
      expect(await replaceRes.json()).toEqual({ categoryIds: [cat1] });

      // An empty array clears all links.
      const clearRes = await putSubjectCategory(subject.id, {
        categoryIds: [],
      });
      expect(await clearRes.json()).toEqual({ categoryIds: [] });
    });

    it('404s PUT for an unknown subject id', async () => {
      const res = await putSubjectCategory(999999, { categoryIds: [] });
      expect(res.status).toBe(404);
    });

    it('rejects a non-array categoryIds with 400', async () => {
      const subject = (await (
        await postSubject({ name: 'invalid body' })
      ).json()) as SubjectDto;

      const res = await putSubjectCategory(subject.id, { categoryIds: 1 });
      expect(res.status).toBe(400);
    });
  });

  describe('pagination and sorting', () => {
    it('paginates with limit/offset and reports page metadata', async () => {
      await postSubject({ name: 'c-charlie' });
      await postSubject({ name: 'a-alpha' });
      await postSubject({ name: 'b-bravo' });

      const res = await app.request('/api/subject?limit=2&offset=0&sort=name');
      const body = (await res.json()) as {
        data: SubjectDto[];
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
        '/api/subject?limit=2&offset=2&sort=name'
      );
      const page2Body = (await page2.json()) as { data: SubjectDto[] };
      expect(page2Body.data).toHaveLength(1);
    });

    it('sorts by name ascending and descending', async () => {
      await postSubject({ name: 'c-charlie' });
      await postSubject({ name: 'a-alpha' });
      await postSubject({ name: 'b-bravo' });

      const ascRes = await app.request('/api/subject?sort=name&order=asc');
      const ascBody = (await ascRes.json()) as { data: SubjectDto[] };
      expect(ascBody.data.map((s) => s.name)).toEqual([
        'a-alpha',
        'b-bravo',
        'c-charlie',
      ]);

      const descRes = await app.request('/api/subject?sort=name&order=desc');
      const descBody = (await descRes.json()) as { data: SubjectDto[] };
      expect(descBody.data.map((s) => s.name)).toEqual([
        'c-charlie',
        'b-bravo',
        'a-alpha',
      ]);
    });

    it('sorts by the concepts CSV', async () => {
      const withConcepts = (await (
        await postSubject({ name: 'has concepts' })
      ).json()) as SubjectDto;
      const withoutConcepts = (await (
        await postSubject({ name: 'no concepts' })
      ).json()) as SubjectDto;
      const db = getDb();
      const [{ insertId: groupId }] = await db
        .insert(conceptGroupTable)
        .values({ name: 'group', subjectId: withConcepts.id });
      await db
        .insert(conceptTable)
        .values({ name: 'a-concept', conceptGroupId: groupId });

      const res = await app.request(
        '/api/subject?sort=concepts&order=asc'
      );
      const { data } = (await res.json()) as { data: SubjectDto[] };
      expect(data.map((s) => s.id)).toEqual([
        withoutConcepts.id,
        withConcepts.id,
      ]);
    });

    it('rejects an out-of-range limit with 400', async () => {
      const res = await app.request('/api/subject?limit=99999');
      expect(res.status).toBe(400);
    });

    it('rejects an invalid sort column with 400', async () => {
      const res = await app.request('/api/subject?sort=bogus');
      expect(res.status).toBe(400);
    });
  });

  describe('admin auth gate', () => {
    it('rejects a write with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await postSubject({ name: 'blocked' });
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({
        status: 401,
        name: 'UnauthorizedError',
        code: 'UNAUTHORIZED',
      });
    });

    it('rejects a write with 403 for a non-admin email', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue('someone-else@example.com');

      const res = await postSubject({ name: 'blocked' });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({
        status: 403,
        name: 'ForbiddenError',
        code: 'FORBIDDEN',
      });
    });

    it('gates the /:id/category relation write the same way', async () => {
      const subject = (await (
        await postSubject({ name: 'gated relation' })
      ).json()) as SubjectDto;

      vi.mocked(verifyIdToken).mockResolvedValue(null);
      const res = await putSubjectCategory(subject.id, { categoryIds: [] });
      expect(res.status).toBe(401);
    });

    it('leaves GET ungated even with no valid identity', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await app.request('/api/subject');
      expect(res.status).toBe(200);
    });
  });
});
