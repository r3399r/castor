import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
import {
  charityCategoryTable,
  charityOrganizationCategoryTable,
  charityOrganizationTable,
  donationBatchTable,
  donationTable,
  guardianTable,
  userGuardianTable,
  userTable,
} from 'src/db/schema';
import { ADMIN_EMAILS } from 'src/middleware/adminAuth';

// The admin gate has its own describe block; every other test only needs
// writes to succeed, so the mocked verification defaults to an admin.
vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdToken: vi.fn() }));
import { verifyIdToken } from 'src/lib/firebaseAdmin';

type CategoryDto = { id: number; code: string; name: string };
type OrganizationDto = {
  id: number;
  name: string;
  taxId: string | null;
  introduction: string;
  websiteUrl: string | null;
  logoUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  categories: CategoryDto[];
  createdAt: string | null;
  updatedAt: string | null;
};
type ListDto = { data: OrganizationDto[]; paginate: { total: number } };

const getList = (query = '') => app.request(`/api/charity-organization${query}`);
const getOne = (id: number | string) => app.request(`/api/charity-organization/${id}`);

const postOrganization = (body: unknown) =>
  app.request('/api/charity-organization', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const putOrganization = (id: number | string, body: unknown) =>
  app.request(`/api/charity-organization/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const putCategories = (id: number | string, body: unknown) =>
  app.request(`/api/charity-organization/${id}/category`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const deleteOrganization = (id: number | string) =>
  app.request(`/api/charity-organization/${id}`, { method: 'DELETE' });

// FK-safe order: donation points at organization, user_guardian and
// charity_category; guardian now points at charity_category too, so
// categories are deleted last of all.
const clearTables = async () => {
  const db = getDb();
  await db.delete(donationTable);
  await db.delete(donationBatchTable);
  await db.delete(charityOrganizationCategoryTable);
  await db.delete(charityOrganizationTable);
  await db.delete(userGuardianTable);
  await db.delete(guardianTable);
  await db.delete(userTable);
  await db.delete(charityCategoryTable);
};

let seq = 0;
const seedCategory = async (overrides: Partial<typeof charityCategoryTable.$inferInsert> = {}) => {
  const db = getDb();
  seq += 1;
  const [{ insertId }] = await db.insert(charityCategoryTable).values({
    code: `cat-${seq}`,
    name: `類別 ${seq}`,
    sortOrder: seq,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  return insertId;
};

const getSuggest = (query = '') =>
  app.request(`/api/charity-organization/suggest${query}`);

/**
 * One confirmed donation to an organisation, so the suggestion has
 * something to rank by. Each one needs its own user and spirit --
 * donation's UNIQUE is on user_guardian_id, so a second donation cannot
 * reuse the first one's spirit.
 */
const seedDonationTo = async (organizationId: number, categoryId: number, amount = 1000) => {
  const db = getDb();
  seq += 1;
  const [{ insertId: userId }] = await db.insert(userTable).values({
    firebaseUid: `donor-${seq}`,
    email: `donor-${seq}@example.com`,
    name: `donor ${seq}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const [{ insertId: speciesId }] = await db.insert(guardianTable).values({
    code: `sp-${seq}`,
    name: `species ${seq}`,
    theme: 'theme',
    cost: 10,
    categoryId,
    // Flat 0: guardian.sort_order is TINYINT UNSIGNED and this file's
    // counter runs past 255.
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const [{ insertId: userGuardianId }] = await db.insert(userGuardianTable).values({
    userId,
    guardianId: speciesId,
    level: 5,
    xp: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(donationTable).values({
    userId,
    userGuardianId,
    categoryId,
    organizationId,
    amount,
    confirmedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
};

const validBody = (categoryIds: number[], overrides: Record<string, unknown> = {}) => ({
  name: '財團法人測試基金會',
  introduction: '做測試用的基金會簡介。',
  websiteUrl: 'https://example.org',
  categoryIds,
  ...overrides,
});

describe('charity organization routes', () => {
  beforeAll(clearTables);

  beforeEach(() => {
    vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);
  });

  afterEach(clearTables);

  afterAll(async () => {
    await closeDb();
  });

  describe('POST /', () => {
    it('creates an organization with its categories', async () => {
      const catA = await seedCategory();
      const catB = await seedCategory();

      const res = await postOrganization(validBody([catA, catB], { taxId: '12345678' }));
      expect(res.status).toBe(201);
      const body = (await res.json()) as OrganizationDto;
      expect(body).toMatchObject({
        name: '財團法人測試基金會',
        taxId: '12345678',
        websiteUrl: 'https://example.org',
        logoUrl: null,
        sortOrder: 0,
        isActive: true,
      });
      expect(body.categories.map((g) => g.id)).toEqual([catA, catB]);

      const links = await getDb()
        .select()
        .from(charityOrganizationCategoryTable)
        .where(eq(charityOrganizationCategoryTable.organizationId, body.id));
      expect(links).toHaveLength(2);
    });

    it('accepts a null tax id for an association that has none', async () => {
      const cat = await seedCategory();

      const res = await postOrganization(validBody([cat], { taxId: null }));
      expect(res.status).toBe(201);
      expect(((await res.json()) as OrganizationDto).taxId).toBeNull();
    });

    it('rejects an empty categoryIds', async () => {
      const res = await postOrganization(validBody([]));
      expect(res.status).toBe(400);
    });

    it('rejects a category that does not exist', async () => {
      const cat = await seedCategory();

      const res = await postOrganization(validBody([cat, cat + 9999]));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ message: 'some categories do not exist' });
    });

    // An inactive category still exists so the public record can name it,
    // but it takes no new organizations.
    it('rejects an inactive category', async () => {
      const active = await seedCategory();
      const retired = await seedCategory({ isActive: false });

      const res = await postOrganization(validBody([active, retired]));
      expect(res.status).toBe(400);

      // Nothing was written -- the whole request rolls back.
      expect(await getDb().select().from(charityOrganizationTable)).toHaveLength(0);
    });

    // The column is UNIQUE, so without the explicit check this surfaces as
    // a driver error and a 500.
    it('rejects a tax id already on file with 400, not 500', async () => {
      const cat = await seedCategory();
      await postOrganization(validBody([cat], { taxId: '12345678' }));

      const res = await postOrganization(
        validBody([cat], { name: '另一個基金會', taxId: '12345678' })
      );
      expect(res.status).toBe(400);
    });

    it('rejects a website url with no scheme', async () => {
      const cat = await seedCategory();

      const res = await postOrganization(validBody([cat], { websiteUrl: 'www.example.org' }));
      expect(res.status).toBe(400);
    });

    it('rejects a tax id that is not 8 digits', async () => {
      const cat = await seedCategory();

      expect((await postOrganization(validBody([cat], { taxId: '1234567' }))).status).toBe(400);
      expect((await postOrganization(validBody([cat], { taxId: 'ABCDEFGH' }))).status).toBe(400);
    });
  });

  describe('GET /', () => {
    it('lists organizations with their categories, sorted by sortOrder then id', async () => {
      const cat = await seedCategory();
      const second = (await (
        await postOrganization(validBody([cat], { name: '乙基金會', sortOrder: 5 }))
      ).json()) as OrganizationDto;
      const first = (await (
        await postOrganization(validBody([cat], { name: '甲基金會', sortOrder: 1 }))
      ).json()) as OrganizationDto;

      const res = await getList();
      expect(res.status).toBe(200);
      const body = (await res.json()) as ListDto;
      expect(body.data.map((o) => o.id)).toEqual([first.id, second.id]);
      expect(body.paginate.total).toBe(2);
      expect(body.data[0].categories.map((g) => g.id)).toEqual([cat]);
    });

    it('filters by category', async () => {
      const catA = await seedCategory();
      const catB = await seedCategory();
      const inA = (await (await postOrganization(validBody([catA]))).json()) as OrganizationDto;
      await postOrganization(validBody([catB], { name: '別的基金會' }));

      const res = await getList(`?categoryId=${catA}`);
      const body = (await res.json()) as ListDto;
      expect(body.data.map((o) => o.id)).toEqual([inA.id]);
      expect(body.paginate.total).toBe(1);
    });

    // An organization under two categories must still be one row, or
    // paginate.total stops matching the page it describes.
    it('counts an organization in two categories once', async () => {
      const catA = await seedCategory();
      const catB = await seedCategory();
      await postOrganization(validBody([catA, catB]));

      const res = await getList();
      const body = (await res.json()) as ListDto;
      expect(body.data).toHaveLength(1);
      expect(body.paginate.total).toBe(1);
      expect(body.data[0].categories).toHaveLength(2);
    });

    it('returns an empty page for a category nothing belongs to', async () => {
      const used = await seedCategory();
      const unused = await seedCategory();
      await postOrganization(validBody([used]));

      const res = await getList(`?categoryId=${unused}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as ListDto;
      expect(body.data).toEqual([]);
      expect(body.paginate.total).toBe(0);
    });

    // z.coerce.boolean() maps the string "false" to true, which would
    // make isActive=false silently list the active ones instead.
    it('filters by isActive in both directions', async () => {
      const cat = await seedCategory();
      const active = (await (await postOrganization(validBody([cat]))).json()) as OrganizationDto;
      const retired = (await (
        await postOrganization(validBody([cat], { name: '已停用', isActive: false }))
      ).json()) as OrganizationDto;

      const onlyActive = (await (await getList('?isActive=true')).json()) as ListDto;
      expect(onlyActive.data.map((o) => o.id)).toEqual([active.id]);

      const onlyRetired = (await (await getList('?isActive=false')).json()) as ListDto;
      expect(onlyRetired.data.map((o) => o.id)).toEqual([retired.id]);

      const all = (await (await getList()).json()) as ListDto;
      expect(all.paginate.total).toBe(2);
    });

    it('combines the category and isActive filters', async () => {
      const catA = await seedCategory();
      const catB = await seedCategory();
      const wanted = (await (
        await postOrganization(validBody([catA]))
      ).json()) as OrganizationDto;
      await postOrganization(validBody([catA], { name: '停用的', isActive: false }));
      await postOrganization(validBody([catB], { name: '別類的' }));

      const res = await getList(`?categoryId=${catA}&isActive=true`);
      const body = (await res.json()) as ListDto;
      expect(body.data.map((o) => o.id)).toEqual([wanted.id]);
    });
  });

  describe('GET /:id', () => {
    it('returns one organization with its categories', async () => {
      const cat = await seedCategory();
      const created = (await (await postOrganization(validBody([cat]))).json()) as OrganizationDto;

      const res = await getOne(created.id);
      expect(res.status).toBe(200);
      const body = (await res.json()) as OrganizationDto;
      expect(body.id).toBe(created.id);
      expect(body.categories.map((g) => g.id)).toEqual([cat]);
    });

    it('returns 404 for an unknown id', async () => {
      expect((await getOne(999999)).status).toBe(404);
    });
  });

  describe('PUT /:id', () => {
    it('updates the fields and replaces the categories', async () => {
      const catA = await seedCategory();
      const catB = await seedCategory();
      const created = (await (await postOrganization(validBody([catA]))).json()) as OrganizationDto;

      const res = await putOrganization(
        created.id,
        validBody([catB], { name: '改名後', introduction: '新簡介', isActive: false, sortOrder: 3 })
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as OrganizationDto;
      expect(body).toMatchObject({ name: '改名後', introduction: '新簡介', isActive: false, sortOrder: 3 });
      expect(body.categories.map((g) => g.id)).toEqual([catB]);
    });

    // Re-saving a form without touching the 統編 must not trip the
    // uniqueness check against the row's own value.
    it('lets an organization keep its own tax id', async () => {
      const cat = await seedCategory();
      const created = (await (
        await postOrganization(validBody([cat], { taxId: '12345678' }))
      ).json()) as OrganizationDto;

      const res = await putOrganization(created.id, validBody([cat], { taxId: '12345678' }));
      expect(res.status).toBe(200);
    });

    it('rejects taking a tax id that belongs to another organization', async () => {
      const cat = await seedCategory();
      await postOrganization(validBody([cat], { taxId: '12345678' }));
      const other = (await (
        await postOrganization(validBody([cat], { name: '乙', taxId: '87654321' }))
      ).json()) as OrganizationDto;

      const res = await putOrganization(other.id, validBody([cat], { taxId: '12345678' }));
      expect(res.status).toBe(400);
    });

    it('returns 404 for an unknown id', async () => {
      const cat = await seedCategory();
      expect((await putOrganization(999999, validBody([cat]))).status).toBe(404);
    });
  });

  describe('PUT /:id/category', () => {
    it('replaces the category links', async () => {
      const catA = await seedCategory();
      const catB = await seedCategory();
      const created = (await (await postOrganization(validBody([catA]))).json()) as OrganizationDto;

      const res = await putCategories(created.id, { categoryIds: [catB] });
      expect(res.status).toBe(200);
      expect(((await res.json()) as { categories: CategoryDto[] }).categories.map((g) => g.id)).toEqual([catB]);
    });

    it('rejects an empty list', async () => {
      const cat = await seedCategory();
      const created = (await (await postOrganization(validBody([cat]))).json()) as OrganizationDto;

      expect((await putCategories(created.id, { categoryIds: [] })).status).toBe(400);
      // The original link survived the rejection.
      expect(((await (await getOne(created.id)).json()) as OrganizationDto).categories).toHaveLength(1);
    });

    it('rejects an inactive category', async () => {
      const cat = await seedCategory();
      const retired = await seedCategory({ isActive: false });
      const created = (await (await postOrganization(validBody([cat]))).json()) as OrganizationDto;

      expect((await putCategories(created.id, { categoryIds: [retired] })).status).toBe(400);
    });

    it('returns 404 for an unknown id', async () => {
      const cat = await seedCategory();
      expect((await putCategories(999999, { categoryIds: [cat] })).status).toBe(404);
    });
  });

  describe('DELETE /:id', () => {
    it('deletes an organization that has taken no money, links and all', async () => {
      const cat = await seedCategory();
      const created = (await (await postOrganization(validBody([cat]))).json()) as OrganizationDto;

      const res = await deleteOrganization(created.id);
      expect(res.status).toBe(204);
      expect(await getDb().select().from(charityOrganizationTable)).toHaveLength(0);
      expect(await getDb().select().from(charityOrganizationCategoryTable)).toHaveLength(0);
    });

    // The public page has to keep naming an organization that was paid.
    // Both counts are also FKs, so without the check this is a 500.
    it('refuses to delete an organization with a donation, with 400', async () => {
      const db = getDb();
      const cat = await seedCategory();
      const created = (await (await postOrganization(validBody([cat]))).json()) as OrganizationDto;

      const [{ insertId: userId }] = await db.insert(userTable).values({
        firebaseUid: 'donor-uid',
        email: 'donor@example.com',
        name: 'donor',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // A spirit species belonging to this category, then one owned
      // instance of it at max level.
      const [{ insertId: speciesId }] = await db.insert(guardianTable).values({
        code: `species-${cat}`,
        name: '測試之蛋',
        theme: '測試主題',
        cost: 10,
        categoryId: cat,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const [{ insertId: userGuardianId }] = await db.insert(userGuardianTable).values({
        userId,
        guardianId: speciesId,
        level: 5,
        xp: 675000,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await db.insert(donationTable).values({
        userId,
        userGuardianId,
        categoryId: cat,
        organizationId: created.id,
        amount: 1000,
        confirmedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await deleteOrganization(created.id);
      expect(res.status).toBe(400);
      expect(await db.select().from(charityOrganizationTable)).toHaveLength(1);
    });

    it('refuses to delete an organization with a payout batch, with 400', async () => {
      const db = getDb();
      const cat = await seedCategory();
      const created = (await (await postOrganization(validBody([cat]))).json()) as OrganizationDto;
      await db.insert(donationBatchTable).values({
        organizationId: created.id,
        transferredAmount: 60000,
        transferredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await deleteOrganization(created.id);
      expect(res.status).toBe(400);
    });

    it('returns 404 for an unknown id', async () => {
      expect((await deleteOrganization(999999)).status).toBe(404);
    });
  });

  describe('admin auth gate', () => {
    it('rejects a write with 401 when there is no valid identity', async () => {
      const cat = await seedCategory();
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await postOrganization(validBody([cat]));
      expect(res.status).toBe(401);
    });

    it('rejects a write with 403 for a non-admin email', async () => {
      const cat = await seedCategory();
      vi.mocked(verifyIdToken).mockResolvedValue('someone-else@example.com');

      const res = await postOrganization(validBody([cat]));
      expect(res.status).toBe(403);
    });

    // Deliberately open, unlike the writes: this is the data the public
    // transparency page publishes.
    it('allows reads with no identity at all', async () => {
      const cat = await seedCategory();
      await postOrganization(validBody([cat]));
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const list = await getList();
      expect(list.status).toBe(200);
      expect(((await list.json()) as ListDto).paginate.total).toBe(1);
    });
  });

  describe('GET /suggest', () => {
    const create = async (categoryIds: number[], overrides: Record<string, unknown> = {}) => {
      const res = await postOrganization(validBody(categoryIds, overrides));
      return ((await res.json()) as OrganizationDto).id;
    };

    it('suggests the organization with the least support so far', async () => {
      const cat = await seedCategory();
      const popular = await create([cat], { name: '甲基金會', sortOrder: 1 });
      const quiet = await create([cat], { name: '乙基金會', sortOrder: 2 });
      await seedDonationTo(popular, cat);

      const res = await getSuggest(`?categoryId=${cat}`);
      expect(res.status).toBe(200);
      // The *later*-sorted one wins, which is the whole point: without the
      // ranking the first row would simply keep collecting donations.
      expect((await res.json()) as OrganizationDto).toMatchObject({ id: quiet, name: '乙基金會' });
    });

    it('ranks by amount, not by number of donations', async () => {
      // Amounts are uniform today, but donation.amount is frozen per row
      // precisely because that can change. "Least supported" is a
      // statement about money.
      const cat = await seedCategory();
      const twoSmall = await create([cat], { name: '甲基金會', sortOrder: 1 });
      const oneBig = await create([cat], { name: '乙基金會', sortOrder: 2 });
      await seedDonationTo(twoSmall, cat, 100);
      await seedDonationTo(twoSmall, cat, 100);
      await seedDonationTo(oneBig, cat, 1000);

      const body = (await (await getSuggest(`?categoryId=${cat}`)).json()) as OrganizationDto;
      expect(body.id).toBe(twoSmall);
    });

    it('includes an organization nobody has chosen yet', async () => {
      // It has no donation rows at all, so an inner join would drop it --
      // ranking it last by excluding it instead of first by counting zero.
      const cat = await seedCategory();
      const chosen = await create([cat], { name: '甲基金會', sortOrder: 1 });
      const untouched = await create([cat], { name: '乙基金會', sortOrder: 2 });
      await seedDonationTo(chosen, cat);

      const body = (await (await getSuggest(`?categoryId=${cat}`)).json()) as OrganizationDto;
      expect(body.id).toBe(untouched);
    });

    it('breaks a tie by sortOrder, so the answer is the same every time', async () => {
      // Two organisations, nothing donated to either, so only the
      // tiebreakers decide. The loop pins what is actually observable:
      // three calls, one answer.
      //
      // It does not reliably pin the tiebreakers themselves. MySQL's order
      // for rows with equal sort keys is unspecified, and measurably
      // varies between runs -- deleting `asc(sortOrder), asc(id)` failed
      // this test on one mutation run and passed on the next. The
      // tiebreakers stay because determinism is their whole job, and no
      // single assertion can demonstrate determinism.
      const cat = await seedCategory();
      const second = await create([cat], { name: '乙基金會', sortOrder: 5 });
      const first = await create([cat], { name: '甲基金會', sortOrder: 1 });

      for (let i = 0; i < 3; i++) {
        const body = (await (await getSuggest(`?categoryId=${cat}`)).json()) as OrganizationDto;
        expect(body.id).toBe(first);
      }
      expect(second).not.toBe(first);
    });

    it('never suggests an inactive organization', async () => {
      // POST /api/donation refuses one, so suggesting it is a dead end.
      const cat = await seedCategory();
      const retired = await create([cat], { name: '甲基金會', sortOrder: 1, isActive: false });
      const active = await create([cat], { name: '乙基金會', sortOrder: 2 });

      const body = (await (await getSuggest(`?categoryId=${cat}`)).json()) as OrganizationDto;
      expect(body.id).toBe(active);
      expect(body.id).not.toBe(retired);
    });

    it('only considers organizations filed under the requested category', async () => {
      // `elsewhere` is given the winning sortOrder on purpose: both have no
      // donations, so with the category filter removed it is the one that
      // comes back. Without that arrangement the test passes either way
      // and pins nothing.
      const wanted = await seedCategory();
      const other = await seedCategory();
      const elsewhere = await create([other], { name: '甲基金會', sortOrder: 1 });
      const inCategory = await create([wanted], { name: '乙基金會', sortOrder: 2 });

      const body = (await (await getSuggest(`?categoryId=${wanted}`)).json()) as OrganizationDto;
      expect(body.id).toBe(inCategory);
      expect(body.id).not.toBe(elsewhere);
    });

    it("counts an organization's whole history, not just this category's", async () => {
      // An organisation can be filed under several categories. The money it
      // received is the money it received, whichever category routed it.
      const wanted = await seedCategory();
      const other = await seedCategory();
      const busyElsewhere = await create([wanted, other], { name: '甲基金會', sortOrder: 1 });
      const quiet = await create([wanted], { name: '乙基金會', sortOrder: 2 });
      await seedDonationTo(busyElsewhere, other);

      const body = (await (await getSuggest(`?categoryId=${wanted}`)).json()) as OrganizationDto;
      expect(body.id).toBe(quiet);
    });

    it('answers 404 when the category has no active organization', async () => {
      const cat = await seedCategory();
      const res = await getSuggest(`?categoryId=${cat}`);
      expect(res.status).toBe(404);
      expect(((await res.json()) as { code?: string }).code).toBe('NO_ORGANIZATION_AVAILABLE');
    });

    it('tells a non-existent category apart from one with nothing in it', async () => {
      // Both are 404, so the status alone proves nothing: without the
      // explicit category check this request falls through to the
      // no-organisation branch and answers the same way. The *code* is
      // what separates a bad link from a category that is simply not
      // stocked yet.
      const res = await getSuggest('?categoryId=999999');
      expect(res.status).toBe(404);
      expect(((await res.json()) as { code?: string }).code).toBe('NOT_FOUND');
    });

    it('rejects a request with no categoryId', async () => {
      expect((await getSuggest()).status).toBe(400);
    });

    it('is matched before /:id, not as an id named "suggest"', async () => {
      // Hono matches routes in declaration order. With /suggest declared
      // after /:id this request reaches the id handler as Number('suggest')
      // = NaN, which answers 404 -- so a passing 200 here is what proves
      // the ordering.
      const cat = await seedCategory();
      await create([cat]);

      const res = await getSuggest(`?categoryId=${cat}`);
      expect(res.status).toBe(200);
    });

    it('needs no identity, like the other reads here', async () => {
      const cat = await seedCategory();
      await create([cat]);
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      expect((await getSuggest(`?categoryId=${cat}`)).status).toBe(200);
    });
  });
});
