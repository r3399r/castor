import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
import {
  charityCategoryTable,
  charityOrganizationCategoryTable,
  charityOrganizationTable,
  donationBatchTable,
} from 'src/db/schema';
// Cast from the schema rather than from a hand-written type: this helper
// describes what the endpoint sends, and the schema is the description.
import type { z } from 'zod';
import {
  getInfoCharityOrganizationResponseSchema,
  getInfoDonationResponseSchema,
} from 'src/routes/info';

// Deliberately no firebaseAdmin mock: this endpoint takes no token, and
// mocking the verifier would hide it if that ever changed.

const getRoster = async () => {
  const res = await app.request('/api/info/charity-organization');
  expect(res.status).toBe(200);

  return (await res.json()) as z.infer<typeof getInfoCharityOrganizationResponseSchema>;
};

// FK-safe order: batches and the link rows before the organisations they
// point at, and the categories last.
const clearTables = async () => {
  const db = getDb();
  await db.delete(donationBatchTable);
  await db.delete(charityOrganizationCategoryTable);
  await db.delete(charityOrganizationTable);
  await db.delete(charityCategoryTable);
};

let seq = 0;

const seedCategory = async ({ sortOrder = 0, isActive = true } = {}) => {
  seq += 1;
  const [{ insertId }] = await getDb()
    .insert(charityCategoryTable)
    .values({
      code: `cat-${seq}`,
      name: `類別 ${seq}`,
      sortOrder,
      isActive,
      createdAt: new Date(),
    });
  return insertId;
};

const seedOrganization = async (
  name: string,
  {
    categoryIds,
    isActive = true,
    sortOrder = 0,
  }: { categoryIds: number[]; isActive?: boolean; sortOrder?: number }
) => {
  const db = getDb();
  const [{ insertId }] = await db.insert(charityOrganizationTable).values({
    name,
    introduction: `${name} 的簡介`,
    websiteUrl: 'https://example.org',
    sortOrder,
    isActive,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db
    .insert(charityOrganizationCategoryTable)
    .values(categoryIds.map((categoryId) => ({ organizationId: insertId, categoryId })));
  return insertId;
};

const seedBatch = async (
  organizationId: number,
  { transferredAmount, published = true }: { transferredAmount: number; published?: boolean }
) => {
  const [{ insertId }] = await getDb().insert(donationBatchTable).values({
    organizationId,
    transferredAmount,
    transferredAt: new Date('2026-12-01T00:00:00.000Z'),
    reference: '8842',
    published,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return insertId;
};

describe('info charity organization roster', () => {
  beforeEach(clearTables);
  afterEach(clearTables);

  afterAll(async () => {
    await closeDb();
  });

  // The point of the endpoint. Mounted in the public /api/info group, on a
  // CloudFront behavior that forwards no Authorization at all -- the
  // roster accompanies the payout record, which is proof only if someone
  // who has never signed in can read it.
  it('answers without any credentials', async () => {
    const res = await app.request('/api/info/charity-organization');
    expect(res.status).toBe(200);
  });

  it('answers an empty list on an untouched database', async () => {
    expect(await getRoster()).toEqual([]);
  });

  // The reason this is not /api/info/donation: an organisation nobody has
  // chosen has no batch, so the payout list cannot show it, and it is
  // exactly what a reader wants to see.
  it('lists an organisation nobody has been paid for, at zero', async () => {
    const categoryId = await seedCategory();
    await seedOrganization('OO 基金會', { categoryIds: [categoryId] });

    const [organization] = await getRoster();
    expect(organization).toMatchObject({
      name: 'OO 基金會',
      isActive: true,
      receivedAmount: 0,
      batchCount: 0,
    });
  });

  describe('the categories', () => {
    it('labels each organisation with its categories, in the category order', async () => {
      const second = await seedCategory({ sortOrder: 2 });
      const first = await seedCategory({ sortOrder: 1 });
      await seedOrganization('兩個類別的基金會', { categoryIds: [second, first] });

      const [organization] = await getRoster();
      expect(organization.categories.map((category) => category.id)).toEqual([first, second]);
    });

    // The flat shape is what makes the page's arithmetic checkable: nested
    // under categories, an organisation filed under two would be printed
    // twice and its amount counted twice.
    it('prints an organisation filed under two categories once', async () => {
      const a = await seedCategory({ sortOrder: 1 });
      const b = await seedCategory({ sortOrder: 2 });
      await seedOrganization('大型基金會', { categoryIds: [a, b] });

      const roster = await getRoster();
      expect(roster).toHaveLength(1);
      expect(roster[0].categories).toHaveLength(2);
    });

    // An inactive category is out of the chooser but is still what the
    // organisation was offered under. A card with no label at all would be
    // worse than one labelled with a category nobody can pick today.
    it('keeps a label from a category that is out of circulation', async () => {
      const retired = await seedCategory({ isActive: false });
      await seedOrganization('舊類別的基金會', { categoryIds: [retired] });

      const [organization] = await getRoster();
      expect(organization.categories.map((category) => category.id)).toEqual([retired]);
    });
  });

  describe('what has been received', () => {
    it('sums the published batches and counts them', async () => {
      const categoryId = await seedCategory();
      const organizationId = await seedOrganization('OO 基金會', { categoryIds: [categoryId] });
      await seedBatch(organizationId, { transferredAmount: 5000 });
      await seedBatch(organizationId, { transferredAmount: 1200 });

      const [organization] = await getRoster();
      expect(organization.receivedAmount).toBe(6200);
      expect(organization.batchCount).toBe(2);
    });

    // The same condition /api/info/donation lists batches under. An
    // unpublished batch has no evidence attached yet and may still be
    // wrong; counting it here would announce a payout nobody can check.
    it('ignores an unpublished batch', async () => {
      const categoryId = await seedCategory();
      const organizationId = await seedOrganization('OO 基金會', { categoryIds: [categoryId] });
      await seedBatch(organizationId, { transferredAmount: 5000, published: false });

      const [organization] = await getRoster();
      expect(organization.receivedAmount).toBe(0);
      expect(organization.batchCount).toBe(0);
    });

    // The one assertion that pins the page's claim: the roster's amounts
    // are the payout list's amounts, so a reader can add up the cards and
    // land on the headline total.
    it('adds up to the donation record total', async () => {
      const categoryId = await seedCategory();
      const first = await seedOrganization('第一基金會', { categoryIds: [categoryId] });
      const second = await seedOrganization('第二基金會', { categoryIds: [categoryId] });
      await seedBatch(first, { transferredAmount: 5000 });
      await seedBatch(second, { transferredAmount: 2500 });
      await seedBatch(second, { transferredAmount: 300, published: false });

      const roster = await getRoster();
      const res = await app.request('/api/info/donation');
      const record = (await res.json()) as z.infer<typeof getInfoDonationResponseSchema>;

      const summed = roster.reduce((total, row) => total + row.receivedAmount, 0);
      expect(summed).toBe(record.summary.transferredAmount);
      expect(summed).toBe(7500);
    });

    // Not a number the database can hand back as text. A bare SUM() comes
    // through mysql2 as a string and would reach the page as "6200",
    // which renders but cannot be added to anything.
    it('reports the amount as a number', async () => {
      const categoryId = await seedCategory();
      const organizationId = await seedOrganization('OO 基金會', { categoryIds: [categoryId] });
      await seedBatch(organizationId, { transferredAmount: 6200 });

      const [organization] = await getRoster();
      expect(typeof organization.receivedAmount).toBe('number');
      expect(typeof organization.batchCount).toBe('number');
    });
  });

  describe('a withdrawn organisation', () => {
    // is_active = 0 is how one leaves, and the chooser is what it leaves.
    it('is left out while nothing has been paid to it', async () => {
      const categoryId = await seedCategory();
      await seedOrganization('已退出基金會', { categoryIds: [categoryId], isActive: false });

      expect(await getRoster()).toEqual([]);
    });

    // Dropping it would break the sum above, leaving money in the total
    // that belongs to nobody on the list -- and the batch naming it is
    // still rendered by /api/info/donation.
    it('stays listed once it has been paid, flagged inactive', async () => {
      const categoryId = await seedCategory();
      const organizationId = await seedOrganization('已退出基金會', {
        categoryIds: [categoryId],
        isActive: false,
      });
      await seedBatch(organizationId, { transferredAmount: 4000 });

      const [organization] = await getRoster();
      expect(organization).toMatchObject({
        name: '已退出基金會',
        isActive: false,
        receivedAmount: 4000,
        batchCount: 1,
      });
    });

    it('sorts after the organisations still being offered', async () => {
      const categoryId = await seedCategory();
      // sortOrder 1 against 9: the withdrawn one would come first on the
      // curated order alone, which is what isActive descending overrides.
      const withdrawn = await seedOrganization('已退出基金會', {
        categoryIds: [categoryId],
        isActive: false,
        sortOrder: 1,
      });
      await seedBatch(withdrawn, { transferredAmount: 4000 });
      await seedOrganization('現役基金會', { categoryIds: [categoryId], sortOrder: 9 });

      const roster = await getRoster();
      expect(roster.map((row) => row.name)).toEqual(['現役基金會', '已退出基金會']);
    });
  });

  // sortOrder defaults to 0 for every row, so without the id tiebreaker
  // the order is whatever MySQL happens to return and the page reshuffles
  // between loads.
  it('orders by the curated sortOrder, then by id', async () => {
    const categoryId = await seedCategory();
    await seedOrganization('第三', { categoryIds: [categoryId], sortOrder: 2 });
    await seedOrganization('第一', { categoryIds: [categoryId], sortOrder: 1 });
    await seedOrganization('第四', { categoryIds: [categoryId], sortOrder: 2 });

    const roster = await getRoster();
    expect(roster.map((row) => row.name)).toEqual(['第一', '第三', '第四']);
  });

  describe('the response shape', () => {
    it('parses against the schema', async () => {
      const categoryId = await seedCategory();
      const organizationId = await seedOrganization('OO 基金會', { categoryIds: [categoryId] });
      await seedBatch(organizationId, { transferredAmount: 5000 });

      const body = await getRoster();
      expect(() => getInfoCharityOrganizationResponseSchema.parse(body)).not.toThrow();
    });

    // zod strips unknown keys rather than rejecting them, so parsing alone
    // would pass a column added to the query and spread into the response
    // while it appears in no document. The taxId is the one to watch here:
    // it is on the table and deliberately not on the public record.
    it('sends exactly the keys the schema lists', async () => {
      const categoryId = await seedCategory();
      const organizationId = await seedOrganization('OO 基金會', { categoryIds: [categoryId] });
      await seedBatch(organizationId, { transferredAmount: 5000 });

      const [organization] = await getRoster();
      expect(Object.keys(organization).sort()).toEqual([
        'batchCount',
        'categories',
        'id',
        'introduction',
        'isActive',
        'logoUrl',
        'name',
        'receivedAmount',
        'websiteUrl',
      ]);
      expect(Object.keys(organization.categories[0]).sort()).toEqual(['code', 'id', 'name']);
    });
  });
});
