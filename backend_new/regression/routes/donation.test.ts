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
import { MAX_LEVEL } from 'src/lib/guardianLevel';
import { DONATION_AMOUNT } from 'src/lib/donationAmount';

vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdToken: vi.fn(), verifyIdTokenUid: vi.fn() }));
import { verifyIdTokenUid } from 'src/lib/firebaseAdmin';

type DonationDto = {
  id: number;
  userGuardianId: number;
  amount: number;
  confirmedAt: string;
  category: { id: number; code: string; name: string };
  organization: { id: number; name: string };
  batch: { id: number; transferredAt: string; published: boolean } | null;
};
type ListDto = {
  data: DonationDto[];
  paginate: { total: number };
  donationAmount: number;
};

import { donationSchema, getDonationResponseSchema } from 'src/routes/donation';

const getDonations = (query = '') => app.request(`/api/donation${query}`);

const postDonation = (body: unknown) =>
  app.request('/api/donation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// FK-safe order: guardian now points at charity_category, so categories
// are deleted last of all.
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

const seedUser = async (firebaseUid = 'donor-uid') => {
  const db = getDb();
  const [{ insertId }] = await db.insert(userTable).values({
    firebaseUid,
    email: `${firebaseUid}@example.com`,
    name: 'donor',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return insertId;
};

/** A public-interest category -- its own table now, not a guardian row. */
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

/**
 * A guardian species. `categoryId` null is what VIP is: a species tied to
 * no category, whose owner may direct the donation at any of them.
 */
const seedSpecies = async (categoryId: number | null) => {
  const db = getDb();
  seq += 1;
  const [{ insertId }] = await db.insert(guardianTable).values({
    code: `species-${seq}`,
    name: `第 ${seq} 之蛋`,
    theme: `主題 ${seq}`,
    cost: 20,
    categoryId,
    sortOrder: seq,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return insertId;
};

/**
 * One owned spirit. Takes the *category* and creates the species behind
 * it, because every test here cares about the category, not the egg --
 * except the VIP cases, which pass null.
 */
const seedSpirit = async (userId: number, categoryId: number | null, level = MAX_LEVEL) => {
  const db = getDb();
  const speciesId = await seedSpecies(categoryId);
  const [{ insertId }] = await db.insert(userGuardianTable).values({
    userId,
    guardianId: speciesId,
    level,
    xp: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return insertId;
};

const seedOrganization = async (categoryIds: number[], overrides: Record<string, unknown> = {}) => {
  const db = getDb();
  seq += 1;
  const [{ insertId }] = await db.insert(charityOrganizationTable).values({
    name: `第 ${seq} 基金會`,
    introduction: '簡介',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  if (categoryIds.length > 0)
    await db
      .insert(charityOrganizationCategoryTable)
      .values(categoryIds.map((categoryId) => ({ organizationId: insertId, categoryId })));
  return insertId;
};

describe('donation routes', () => {
  beforeAll(clearTables);

  beforeEach(() => {
    vi.mocked(verifyIdTokenUid).mockResolvedValue('donor-uid');
  });

  afterEach(clearTables);

  afterAll(async () => {
    await closeDb();
  });

  describe('auth', () => {
    it('rejects with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdTokenUid).mockResolvedValue(null);
      expect((await getDonations()).status).toBe(401);
      expect((await postDonation({ userGuardianId: 1, organizationId: 1 })).status).toBe(401);
    });

    it('rejects with 401 when the token resolves to an unknown user', async () => {
      vi.mocked(verifyIdTokenUid).mockResolvedValue('nobody');
      expect((await getDonations()).status).toBe(401);
    });
  });

  describe('POST /', () => {
    it('confirms a donation for a maxed spirit and freezes the amount', async () => {
      const userId = await seedUser();
      const category = await seedCategory();
      const spirit = await seedSpirit(userId, category);
      const organization = await seedOrganization([category]);

      const res = await postDonation({ userGuardianId: spirit, organizationId: organization });
      expect(res.status).toBe(201);
      const body = (await res.json()) as DonationDto;
      expect(body).toMatchObject({
        userGuardianId: spirit,
        amount: DONATION_AMOUNT,
        batch: null,
      });
      expect(body.category.id).toBe(category);
      expect(body.organization.id).toBe(organization);

      const rows = await getDb().select().from(donationTable);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        userId,
        userGuardianId: spirit,
        categoryId: category,
        organizationId: organization,
        amount: DONATION_AMOUNT,
        // NULL batchId is the whole "awaiting payout" state.
        batchId: null,
      });
    });

    it('rejects a spirit that is not yet at max level', async () => {
      const userId = await seedUser();
      const category = await seedCategory();
      const spirit = await seedSpirit(userId, category, MAX_LEVEL - 1);
      const organization = await seedOrganization([category]);

      const res = await postDonation({ userGuardianId: spirit, organizationId: organization });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: 'GUARDIAN_NOT_MAX_LEVEL' });
      expect(await getDb().select().from(donationTable)).toHaveLength(0);
    });

    // The irreversibility of the whole feature. donation.userGuardianId is
    // UNIQUE; this check exists so a double-tapped button says so instead
    // of surfacing a driver error as a 500.
    it('refuses a second donation from the same spirit', async () => {
      const userId = await seedUser();
      const category = await seedCategory();
      const spirit = await seedSpirit(userId, category);
      const first = await seedOrganization([category]);
      const second = await seedOrganization([category]);

      expect((await postDonation({ userGuardianId: spirit, organizationId: first })).status).toBe(201);

      const res = await postDonation({ userGuardianId: spirit, organizationId: second });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: 'DONATION_ALREADY_CONFIRMED' });
      expect(await getDb().select().from(donationTable)).toHaveLength(1);
    });

    // user_guardian is UNIQUE on (user_id, guardian_id), i.e. one spirit
    // per *species*. seedSpirit mints a fresh species per call, so this
    // is two spirits under one category -- which the schema now permits
    // because a category may hold several eggs.
    it('lets a different maxed spirit of the same user donate too', async () => {
      const userId = await seedUser();
      const category = await seedCategory();
      const a = await seedSpirit(userId, category);
      const b = await seedSpirit(userId, category);
      const organization = await seedOrganization([category]);

      expect((await postDonation({ userGuardianId: a, organizationId: organization })).status).toBe(201);
      expect((await postDonation({ userGuardianId: b, organizationId: organization })).status).toBe(201);
      expect(await getDb().select().from(donationTable)).toHaveLength(2);
    });

    // Someone else's spirit reads as not-found rather than forbidden:
    // whether a given id exists is not this caller's business.
    it('cannot spend a spirit belonging to another user', async () => {
      const mine = await seedUser();
      const theirs = await seedUser('other-uid');
      const category = await seedCategory();
      const theirSpirit = await seedSpirit(theirs, category);
      const organization = await seedOrganization([category]);

      const res = await postDonation({ userGuardianId: theirSpirit, organizationId: organization });
      expect(res.status).toBe(404);
      expect(await getDb().select().from(donationTable)).toHaveLength(0);
      void mine;
    });

    it('returns 404 for an unknown spirit', async () => {
      await seedUser();
      const category = await seedCategory();
      const organization = await seedOrganization([category]);

      expect(
        (await postDonation({ userGuardianId: 999999, organizationId: organization })).status
      ).toBe(404);
    });

    it('returns 404 for an unknown organization', async () => {
      const userId = await seedUser();
      const category = await seedCategory();
      const spirit = await seedSpirit(userId, category);

      expect((await postDonation({ userGuardianId: spirit, organizationId: 999999 })).status).toBe(404);
    });

    it('rejects a deactivated organization', async () => {
      const userId = await seedUser();
      const category = await seedCategory();
      const spirit = await seedSpirit(userId, category);
      const organization = await seedOrganization([category], { isActive: false });

      const res = await postDonation({ userGuardianId: spirit, organizationId: organization });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: 'ORGANIZATION_INACTIVE' });
    });

    // The public page groups by category, so the category on the row and
    // the list the user browsed have to be the same thing.
    it('rejects an organization not offered under the chosen category', async () => {
      const userId = await seedUser();
      const category = await seedCategory();
      const otherCategory = await seedCategory();
      const spirit = await seedSpirit(userId, category);
      const organization = await seedOrganization([otherCategory]);

      const res = await postDonation({ userGuardianId: spirit, organizationId: organization });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: 'ORGANIZATION_CATEGORY_MISMATCH' });
    });

    describe('category rules', () => {
      it('files an ordinary spirit under its own category when none is given', async () => {
        const userId = await seedUser();
        const category = await seedCategory();
        const spirit = await seedSpirit(userId, category);
        const organization = await seedOrganization([category]);

        const res = await postDonation({ userGuardianId: spirit, organizationId: organization });
        expect(((await res.json()) as DonationDto).category.id).toBe(category);
      });

      it('accepts an ordinary spirit restating its own category', async () => {
        const userId = await seedUser();
        const category = await seedCategory();
        const spirit = await seedSpirit(userId, category);
        const organization = await seedOrganization([category]);

        const res = await postDonation({
          userGuardianId: spirit,
          organizationId: organization,
          categoryId: category,
        });
        expect(res.status).toBe(201);
      });

      it('refuses an ordinary spirit asking for a different category', async () => {
        const userId = await seedUser();
        const category = await seedCategory();
        const otherCategory = await seedCategory();
        const spirit = await seedSpirit(userId, category);
        // Offered under both, so only the spirit's own rule can reject it.
        const organization = await seedOrganization([category, otherCategory]);

        const res = await postDonation({
          userGuardianId: spirit,
          organizationId: organization,
          categoryId: otherCategory,
        });
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ code: 'DONATION_CATEGORY_INVALID' });
      });

      // A species with categoryId null is what VIP is: tied to no
      // category, so its owner picks one. That is why donation.categoryId
      // exists separately from user_guardian.guardianId -- it cannot be
      // recovered by joining through the species.
      it('lets a spirit with no category of its own choose one', async () => {
        const userId = await seedUser();
        const target = await seedCategory();
        const spirit = await seedSpirit(userId, null);
        const organization = await seedOrganization([target]);

        const res = await postDonation({
          userGuardianId: spirit,
          organizationId: organization,
          categoryId: target,
        });
        expect(res.status).toBe(201);
        const body = (await res.json()) as DonationDto;
        expect(body.category.id).toBe(target);

        const [row] = await getDb().select().from(donationTable).where(eq(donationTable.id, body.id));
        expect(row.categoryId).toBe(target);
      });

      it('requires such a spirit to say which category', async () => {
        const userId = await seedUser();
        const target = await seedCategory();
        const spirit = await seedSpirit(userId, null);
        const organization = await seedOrganization([target]);

        const res = await postDonation({ userGuardianId: spirit, organizationId: organization });
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ code: 'DONATION_CATEGORY_REQUIRED' });
      });

      // An inactive category still exists so the public record can name
      // it, but it takes no new donations.
      it('refuses an inactive category', async () => {
        const userId = await seedUser();
        const retired = await seedCategory({ isActive: false });
        const spirit = await seedSpirit(userId, null);
        const organization = await seedOrganization([retired]);

        const res = await postDonation({
          userGuardianId: spirit,
          organizationId: organization,
          categoryId: retired,
        });
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ code: 'DONATION_CATEGORY_INACTIVE' });
      });
    });
  });

  describe('GET /', () => {
    it('lists only the donations belonging to the caller, newest first', async () => {
      const userId = await seedUser();
      const theirs = await seedUser('other-uid');
      const category = await seedCategory();
      const organization = await seedOrganization([category]);
      const first = await seedSpirit(userId, category);
      const second = await seedSpirit(userId, category);
      const theirSpirit = await seedSpirit(theirs, category);

      const a = (await (
        await postDonation({ userGuardianId: first, organizationId: organization })
      ).json()) as DonationDto;
      const b = (await (
        await postDonation({ userGuardianId: second, organizationId: organization })
      ).json()) as DonationDto;

      // A donation belonging to somebody else, inserted directly.
      await getDb().insert(donationTable).values({
        userId: theirs,
        userGuardianId: theirSpirit,
        categoryId: category,
        organizationId: organization,
        amount: DONATION_AMOUNT,
        confirmedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await getDonations();
      expect(res.status).toBe(200);
      const body = (await res.json()) as ListDto;
      expect(body.paginate.total).toBe(2);
      expect(body.data.map((d) => d.id)).toEqual([b.id, a.id]);
      expect(body.donationAmount).toBe(DONATION_AMOUNT);
    });

    it('honours order=asc', async () => {
      const userId = await seedUser();
      const category = await seedCategory();
      const organization = await seedOrganization([category]);
      const first = await seedSpirit(userId, category);
      const second = await seedSpirit(userId, category);
      const a = (await (
        await postDonation({ userGuardianId: first, organizationId: organization })
      ).json()) as DonationDto;
      const b = (await (
        await postDonation({ userGuardianId: second, organizationId: organization })
      ).json()) as DonationDto;

      const body = (await (await getDonations('?order=asc')).json()) as ListDto;
      expect(body.data.map((d) => d.id)).toEqual([a.id, b.id]);
    });

    it('returns an empty page for a user who has not donated', async () => {
      await seedUser();

      const body = (await (await getDonations()).json()) as ListDto;
      expect(body.data).toEqual([]);
      expect(body.paginate.total).toBe(0);
    });

    // A left join, not an inner one: the common case right after
    // confirming is a donation with no batch at all.
    it('reports batch as null while the donation is awaiting payout', async () => {
      const userId = await seedUser();
      const category = await seedCategory();
      const spirit = await seedSpirit(userId, category);
      const organization = await seedOrganization([category]);
      await postDonation({ userGuardianId: spirit, organizationId: organization });

      const body = (await (await getDonations()).json()) as ListDto;
      expect(body.data[0].batch).toBeNull();
    });

    it('reports the batch and its published flag once the money has gone out', async () => {
      const db = getDb();
      const userId = await seedUser();
      const category = await seedCategory();
      const spirit = await seedSpirit(userId, category);
      const organization = await seedOrganization([category]);
      const created = (await (
        await postDonation({ userGuardianId: spirit, organizationId: organization })
      ).json()) as DonationDto;

      const [{ insertId: batchId }] = await db.insert(donationBatchTable).values({
        organizationId: organization,
        transferredAmount: 60000,
        transferredAt: new Date('2026-12-01T00:00:00.000Z'),
        published: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await db.update(donationTable).set({ batchId }).where(eq(donationTable.id, created.id));

      const body = (await (await getDonations()).json()) as ListDto;
      expect(body.data[0].batch).toMatchObject({ id: batchId, published: true });
    });

    it('paginates', async () => {
      const userId = await seedUser();
      const category = await seedCategory();
      const organization = await seedOrganization([category]);
      for (let i = 0; i < 3; i++) {
        const spirit = await seedSpirit(userId, category);
        await postDonation({ userGuardianId: spirit, organizationId: organization });
      }

      const page = (await (await getDonations('?limit=2')).json()) as ListDto;
      expect(page.data).toHaveLength(2);
      expect(page.paginate.total).toBe(3);

      const rest = (await (await getDonations('?limit=2&offset=2')).json()) as ListDto;
      expect(rest.data).toHaveLength(1);
    });
  });

  /**
   * What the OpenAPI document promises, against what is sent.
   *
   * The key checks are separate from the parse because zod strips
   * unknown keys instead of rejecting them, and the handler's
   * `satisfies` does not catch an extra one either: a row with
   * properties the schema does not mention is still assignable to it.
   */
  describe('the OpenAPI document', () => {
    const donationKeys = [
      'amount',
      'batch',
      'category',
      'confirmedAt',
      'id',
      'organization',
      'userGuardianId',
    ];

    it('describes exactly what confirming and listing send', async () => {
      const userId = await seedUser();
      const categoryId = await seedCategory();
      const organizationId = await seedOrganization([categoryId]);
      const speciesId = await seedSpecies(categoryId);
      const userGuardianId = await seedSpirit(userId, categoryId);

      const created: unknown = await (
        await postDonation({ userGuardianId, organizationId })
      ).json();

      expect(donationSchema.safeParse(created).error?.issues ?? []).toEqual([]);
      expect(Object.keys(created as object).sort()).toEqual(donationKeys);
      expect(Object.keys((created as { category: object }).category).sort()).toEqual([
        'code',
        'id',
        'name',
      ]);
      // Five of the organisation's columns: no taxId, no sortOrder, no
      // isActive, no timestamps. This is the giver's own record, not the
      // admin directory.
      expect(Object.keys((created as { organization: object }).organization).sort()).toEqual([
        'id',
        'introduction',
        'logoUrl',
        'name',
        'websiteUrl',
      ]);
      // Awaiting payout, so no batch: `batch` null is the whole state
      // machine, and there is no status column to disagree with it.
      expect((created as { batch: unknown }).batch).toBeNull();
      expect(speciesId).toEqual(expect.any(Number));

      const list: unknown = await (await getDonations()).json();
      const parsed = getDonationResponseSchema.safeParse(list);
      expect(parsed.error?.issues ?? []).toEqual([]);
      expect(parsed.success).toBe(true);
      expect(Object.keys(list as object).sort()).toEqual([
        'data',
        'donationAmount',
        'paginate',
      ]);
      expect(Object.keys((list as { data: object[] }).data[0]).sort()).toEqual(donationKeys);
    });

    it('describes the batch reference once the money has gone out', async () => {
      const userId = await seedUser();
      const categoryId = await seedCategory();
      const organizationId = await seedOrganization([categoryId]);
      await seedSpecies(categoryId);
      const userGuardianId = await seedSpirit(userId, categoryId);
      const created = (await (
        await postDonation({ userGuardianId, organizationId })
      ).json()) as DonationDto;

      const db = getDb();
      const [{ insertId: batchId }] = await db.insert(donationBatchTable).values({
        organizationId,
        transferredAmount: 1000,
        transferredAt: new Date('2026-11-05T00:00:00.000Z'),
        published: true,
        createdAt: new Date(),
      });
      await db
        .update(donationTable)
        .set({ batchId })
        .where(eq(donationTable.id, created.id));

      const list: unknown = await (await getDonations()).json();
      expect(getDonationResponseSchema.safeParse(list).error?.issues ?? []).toEqual([]);
      const [row] = (list as { data: { batch: object }[] }).data;
      // Three fields, and no nulls among them: the left join widens every
      // batch column, so this is what the narrowing in toDto is for.
      expect(Object.keys(row.batch).sort()).toEqual(['id', 'published', 'transferredAt']);
      expect(row.batch).toEqual({
        id: batchId,
        published: true,
        transferredAt: '2026-11-05T00:00:00.000Z',
      });
    });
  });
});
