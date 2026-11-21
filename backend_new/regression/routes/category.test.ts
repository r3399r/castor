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
  subjectCategoryTable,
  subjectTable,
} from 'src/db/schema';
import { ADMIN_EMAILS } from 'src/middleware/adminAuth';
import {
  categorySchema,
  getCategoryKindListResponseSchema,
  getCategoryListResponseSchema,
  getCategorySubjectResponseSchema,
} from 'src/routes/category';

// The admin gate is exercised end-to-end in its own describe block below;
// every other test just needs writes to succeed, so default the mocked
// Firebase verification to the admin identity.
vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdToken: vi.fn() }));
import { verifyIdToken } from 'src/lib/firebaseAdmin';

type CategoryDto = { id: number; name: string; kind: string; createdAt: string };

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
  await db.delete(filterSubjectOptionTable);
  // filter_option.parentId is self-referential -- a bulk DELETE can hit a
  // parent row before a still-live child row that points to it, tripping
  // the FK. Null out every self-reference first so the delete has nothing
  // left to violate.
  await db.update(filterOptionTable).set({ parentId: null });
  await db.delete(filterOptionTable);
  await db.delete(filterDimensionTable);
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
    expect(await res.json()).toEqual({
      data: [],
      paginate: { total: 0, page: 1, limit: 20, totalPages: 1 },
    });
  });

  it('creates a category and lists it back', async () => {
    const postRes = await postCategory({ name: 'english' });
    expect(postRes.status).toBe(201);
    const created = (await postRes.json()) as CategoryDto;
    expect(created).toMatchObject({ name: 'english' });
    expect(created.id).toEqual(expect.any(Number));

    const listRes = await app.request('/api/category');
    const listBody = (await listRes.json()) as {
      data: CategoryDto[];
      paginate: unknown;
    };
    expect(listBody.data).toEqual([created]);
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

  /**
   * `kind` is what /adaptive groups its three exam cards by, and before the
   * column existed the national and licence cards were hard-coded disabled
   * buttons -- so a category created here could not reach them.
   */
  describe('kind', () => {
    it('defaults to admission when the body omits it', async () => {
      const created = (await (
        await postCategory({ name: 'no kind given' })
      ).json()) as CategoryDto;
      expect(created.kind).toBe('admission');
    });

    it('stores and returns the kind it was given', async () => {
      const created = (await (
        await postCategory({ name: '司法特考', kind: 'national' })
      ).json()) as CategoryDto;
      expect(created.kind).toBe('national');

      const read = (await (
        await app.request(`/api/category/${created.id}`)
      ).json()) as CategoryDto;
      expect(read.kind).toBe('national');
    });

    it('rejects a kind outside the three', async () => {
      const res = await postCategory({ name: 'bad kind', kind: 'postgraduate' });
      expect(res.status).toBe(400);
    });

    it('moves a category to another exam family', async () => {
      const created = (await (
        await postCategory({ name: '律師執照' })
      ).json()) as CategoryDto;

      const res = await putCategory(created.id, { name: '律師執照', kind: 'license' });
      expect(res.status).toBe(200);
      expect((await res.json()) as CategoryDto).toMatchObject({ kind: 'license' });
    });

    /**
     * The reason `kind` has no default on the *request* schema. With one, a
     * rename that sends only a name would move the category back to
     * admission -- no error, and the only place it shows is /adaptive, which
     * nobody opens straight after renaming something in /admin.
     */
    it('leaves the kind alone when a PUT sends only a name', async () => {
      const created = (await (
        await postCategory({ name: '高考三級', kind: 'national' })
      ).json()) as CategoryDto;

      const res = await putCategory(created.id, { name: '公務員高考三級' });
      expect(res.status).toBe(200);
      expect((await res.json()) as CategoryDto).toMatchObject({
        name: '公務員高考三級',
        kind: 'national',
      });
    });

    it('lists every kind, so the client can group them itself', async () => {
      await postCategory({ name: '會考', kind: 'admission' });
      await postCategory({ name: '初等考試', kind: 'national' });
      await postCategory({ name: '護理師執照', kind: 'license' });

      const body = (await (
        await app.request('/api/category?limit=1000')
      ).json()) as { data: CategoryDto[] };
      const byName = new Map(body.data.map((row) => [row.name, row.kind]));
      expect(byName.get('會考')).toBe('admission');
      expect(byName.get('初等考試')).toBe('national');
      expect(byName.get('護理師執照')).toBe('license');
    });
  });

  /**
   * The catalogue the frontend lays its cards out from. It replaced a copy of
   * the same three codes and labels inside the webapp, which is why the
   * national and licence cards were hard-coded disabled buttons.
   */
  describe('GET /kind', () => {
    it('serves the exam families in display order, with no credentials', async () => {
      const res = await app.request('/api/category/kind');
      expect(res.status).toBe(200);

      const body = (await res.json()) as { data: { code: string; sortOrder: number }[] };
      expect(body.data.map((row) => row.code)).toEqual(['admission', 'national', 'license']);
      expect(body.data.map((row) => row.sortOrder)).toEqual([1, 2, 3]);
    });

    /**
     * `/:id` matches any single segment, so with the two routes the other way
     * round this path would resolve to the single-category read, parse 'kind'
     * as NaN and answer 404. Pinning it here because the fix is an ordering
     * in the route chain, which nothing else would notice being undone.
     */
    it('is not swallowed by the /:id route', async () => {
      const res = await app.request('/api/category/kind');
      expect(res.status).not.toBe(404);
      expect(await res.json()).toHaveProperty('data');
    });

    it('describes exactly what it sends', async () => {
      const body: unknown = await (await app.request('/api/category/kind')).json();
      const parsed = getCategoryKindListResponseSchema.safeParse(body);
      expect(parsed.error?.issues ?? []).toEqual([]);
      expect(Object.keys(body as object).sort()).toEqual(['data']);
      expect(Object.keys((body as { data: object[] }).data[0]).sort()).toEqual([
        'code',
        'name',
        'sortOrder',
      ]);
    });

    /**
     * The catalogue and the write validation are the same list, so every code
     * this endpoint advertises has to be storable. Without this, serving a
     * fourth family while POST still rejected it would look like a frontend
     * bug.
     */
    it('serves only codes that POST accepts', async () => {
      const { data } = (await (
        await app.request('/api/category/kind')
      ).json()) as { data: { code: string }[] };

      for (const [index, { code }] of data.entries()) {
        const res = await postCategory({ name: `accepts ${code} ${index}`, kind: code });
        expect(res.status).toBe(201);
        expect((await res.json()) as CategoryDto).toMatchObject({ kind: code });
      }
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

  describe('pagination and sorting', () => {
    it('paginates with limit/offset and reports page metadata', async () => {
      await postCategory({ name: 'c-charlie' });
      await postCategory({ name: 'a-alpha' });
      await postCategory({ name: 'b-bravo' });

      const res = await app.request('/api/category?limit=2&offset=0');
      const body = (await res.json()) as {
        data: CategoryDto[];
        paginate: { total: number; page: number; limit: number; totalPages: number };
      };
      expect(body.data).toHaveLength(2);
      expect(body.paginate).toEqual({
        total: 3,
        page: 1,
        limit: 2,
        totalPages: 2,
      });

      const page2 = await app.request('/api/category?limit=2&offset=2');
      const page2Body = (await page2.json()) as { data: CategoryDto[] };
      expect(page2Body.data).toHaveLength(1);
    });

    it('sorts by name ascending and descending', async () => {
      await postCategory({ name: 'c-charlie' });
      await postCategory({ name: 'a-alpha' });
      await postCategory({ name: 'b-bravo' });

      const ascRes = await app.request('/api/category?sort=name&order=asc');
      const ascBody = (await ascRes.json()) as { data: CategoryDto[] };
      expect(ascBody.data.map((c) => c.name)).toEqual([
        'a-alpha',
        'b-bravo',
        'c-charlie',
      ]);

      const descRes = await app.request('/api/category?sort=name&order=desc');
      const descBody = (await descRes.json()) as { data: CategoryDto[] };
      expect(descBody.data.map((c) => c.name)).toEqual([
        'c-charlie',
        'b-bravo',
        'a-alpha',
      ]);
    });

    it('rejects an out-of-range limit with 400', async () => {
      const res = await app.request('/api/category?limit=99999');
      expect(res.status).toBe(400);
    });

    it('rejects an invalid sort column with 400', async () => {
      const res = await app.request('/api/category?sort=bogus');
      expect(res.status).toBe(400);
    });
  });

  describe('/:id/subject', () => {
    it('lists only the subjects linked to this category, ordered by sortOrder', async () => {
      const created = (await (
        await postCategory({ name: 'target category' })
      ).json()) as CategoryDto;
      const db = getDb();
      const [{ insertId: otherCategoryId }] = await db
        .insert(categoryTable)
        .values({ name: 'other category', createdAt: new Date() });
      const [{ insertId: subjectA }] = await db
        .insert(subjectTable)
        .values({ name: 'subject a', sortOrder: 2, createdAt: new Date() });
      const [{ insertId: subjectB }] = await db
        .insert(subjectTable)
        .values({ name: 'subject b', sortOrder: 1, createdAt: new Date() });
      const [{ insertId: unrelatedSubject }] = await db
        .insert(subjectTable)
        .values({ name: 'unrelated subject', createdAt: new Date() });
      await db.insert(subjectCategoryTable).values([
        { subjectId: subjectA, categoryId: created.id },
        { subjectId: subjectB, categoryId: created.id },
        { subjectId: unrelatedSubject, categoryId: otherCategoryId },
      ]);

      const res = await app.request(`/api/category/${created.id}/subject`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        subjects: { id: number; name: string; sortOrder: number }[];
        filterDimensions: unknown[];
      };
      expect(body.subjects.map((s) => s.id)).toEqual([subjectB, subjectA]);
      expect(body.filterDimensions).toEqual([]);
    });

    it('returns empty subjects/filterDimensions for a category with neither', async () => {
      const created = (await (
        await postCategory({ name: 'empty category' })
      ).json()) as CategoryDto;

      const res = await app.request(`/api/category/${created.id}/subject`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ subjects: [], filterDimensions: [] });
    });

    it("bundles filterDimensions with each option's subjectIds alongside the subjects", async () => {
      const created = (await (
        await postCategory({ name: 'filter category' })
      ).json()) as CategoryDto;
      const db = getDb();
      const [{ insertId: subjectA }] = await db
        .insert(subjectTable)
        .values({ name: 'admin subject', createdAt: new Date() });
      const [{ insertId: subjectB }] = await db
        .insert(subjectTable)
        .values({ name: 'tech subject', createdAt: new Date() });
      const [{ insertId: groupDim }] = await db
        .insert(filterDimensionTable)
        .values({ categoryId: created.id, name: '類科分組', sortOrder: 1 });
      const [{ insertId: choiceDim }] = await db
        .insert(filterDimensionTable)
        .values({ categoryId: created.id, name: '類科選擇', sortOrder: 2 });
      const [{ insertId: adminOption }] = await db
        .insert(filterOptionTable)
        .values({ dimensionId: groupDim, name: '行政類' });
      const [{ insertId: subOption }] = await db
        .insert(filterOptionTable)
        .values({ dimensionId: choiceDim, parentId: adminOption, name: '普通行政' });
      await db.insert(filterSubjectOptionTable).values([
        { subjectId: subjectA, optionId: adminOption },
        { subjectId: subjectA, optionId: subOption },
        { subjectId: subjectB, optionId: adminOption },
      ]);

      const res = await app.request(`/api/category/${created.id}/subject`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        subjects: unknown[];
        filterDimensions: {
          id: number;
          name: string;
          sortOrder: number;
          options: { id: number; name: string; parentId: number | null; subjectIds: number[] }[];
        }[];
      };

      expect(body.filterDimensions.map((d) => d.id)).toEqual([groupDim, choiceDim]);
      const group = body.filterDimensions.find((d) => d.id === groupDim)!;
      expect(group.options).toHaveLength(1);
      expect(group.options[0]).toMatchObject({ id: adminOption, parentId: null });
      expect(group.options[0].subjectIds.sort()).toEqual([subjectA, subjectB].sort());

      const choice = body.filterDimensions.find((d) => d.id === choiceDim)!;
      expect(choice.options).toHaveLength(1);
      expect(choice.options[0]).toMatchObject({ id: subOption, parentId: adminOption });
      expect(choice.options[0].subjectIds).toEqual([subjectA]);
    });

    it('includes a dimension with no options yet as an empty options array', async () => {
      const created = (await (
        await postCategory({ name: 'empty dim category' })
      ).json()) as CategoryDto;
      const db = getDb();
      const [{ insertId: dimId }] = await db
        .insert(filterDimensionTable)
        .values({ categoryId: created.id, name: 'no options yet', sortOrder: 1 });

      const res = await app.request(`/api/category/${created.id}/subject`);
      const body = (await res.json()) as { filterDimensions: { id: number; options: unknown[] }[] };
      expect(body.filterDimensions).toEqual([
        { id: dimId, name: 'no options yet', sortOrder: 1, options: [] },
      ]);
    });

    it('404s for an unknown category id', async () => {
      const res = await app.request('/api/category/999999/subject');
      expect(res.status).toBe(404);
    });
  });

  /**
   * What the OpenAPI document promises, against what is sent.
   *
   * The key checks are separate from the parse because zod strips
   * unknown keys instead of rejecting them: a column added to `category`
   * and returned with the row would pass the parse while appearing in no
   * document. The handlers list their fields now, and this is what keeps
   * them listing them.
   */
  describe('the OpenAPI document', () => {
    it('describes exactly what the list and the single read send', async () => {
      const created = (await (
        await postCategory({ name: 'documented' })
      ).json()) as CategoryDto;

      const list: unknown = await (await app.request('/api/category')).json();
      const listParsed = getCategoryListResponseSchema.safeParse(list);
      expect(listParsed.error?.issues ?? []).toEqual([]);
      expect(Object.keys(list as object).sort()).toEqual(['data', 'paginate']);
      expect(Object.keys((list as { data: object[] }).data[0]).sort()).toEqual([
        'createdAt',
        'id',
        'kind',
        'name',
      ]);

      const one: unknown = await (await app.request(`/api/category/${created.id}`)).json();
      const oneParsed = categorySchema.safeParse(one);
      expect(oneParsed.error?.issues ?? []).toEqual([]);
      expect(Object.keys(one as object).sort()).toEqual(['createdAt', 'id', 'kind', 'name']);
    });

    it("describes exactly what a category's subjects and filters send", async () => {
      const created = (await (
        await postCategory({ name: 'documented filters' })
      ).json()) as CategoryDto;
      const db = getDb();
      const [{ insertId: subjectId }] = await db
        .insert(subjectTable)
        .values({ name: 'a subject', sortOrder: 1, createdAt: new Date() });
      await db.insert(subjectCategoryTable).values({ subjectId, categoryId: created.id });
      const [{ insertId: dimensionId }] = await db
        .insert(filterDimensionTable)
        .values({ categoryId: created.id, name: '類科分組', sortOrder: 1 });
      const [{ insertId: optionId }] = await db
        .insert(filterOptionTable)
        .values({ dimensionId, name: '行政類' });
      await db.insert(filterSubjectOptionTable).values({ subjectId, optionId });

      const body: unknown = await (
        await app.request(`/api/category/${created.id}/subject`)
      ).json();

      const parsed = getCategorySubjectResponseSchema.safeParse(body);
      expect(parsed.error?.issues ?? []).toEqual([]);
      expect(parsed.success).toBe(true);
      expect(Object.keys(body as object).sort()).toEqual(['filterDimensions', 'subjects']);

      const record = body as {
        subjects: object[];
        filterDimensions: { options: object[] }[];
      };
      expect(Object.keys(record.subjects[0]).sort()).toEqual(['id', 'name', 'sortOrder']);
      expect(Object.keys(record.filterDimensions[0]).sort()).toEqual([
        'id',
        'name',
        'options',
        'sortOrder',
      ]);
      expect(Object.keys(record.filterDimensions[0].options[0]).sort()).toEqual([
        'id',
        'name',
        'parentId',
        'subjectIds',
      ]);
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
