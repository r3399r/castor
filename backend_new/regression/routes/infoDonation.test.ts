import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
import {
  charityCategoryTable,
  charityOrganizationCategoryTable,
  charityOrganizationTable,
  donationBatchEvidenceTable,
  donationBatchTable,
  donationTable,
  guardianTable,
  userGuardianTable,
  userTable,
} from 'src/db/schema';
import { DONATION_AMOUNT } from 'src/lib/donationAmount';
import { MAX_LEVEL } from 'src/lib/guardianLevel';
import type { GetInfoDonationResponse } from '@castor/shared';

// Deliberately no firebaseAdmin mock: this endpoint takes no token, and
// mocking the verifier would hide it if that ever changed.

const getRecord = async (query = '') => {
  const res = await app.request(`/api/info/donation${query}`);
  expect(res.status).toBe(200);

  return (await res.json()) as GetInfoDonationResponse;
};

// FK-safe order: evidence before batches, donations before both, and
// categories last since guardian points at them.
const clearTables = async () => {
  const db = getDb();
  await db.delete(donationBatchEvidenceTable);
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

const seedUser = async () => {
  seq += 1;
  const [{ insertId }] = await getDb()
    .insert(userTable)
    .values({
      firebaseUid: `donor-${seq}`,
      email: `donor-${seq}@example.com`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  return insertId;
};

const seedCategory = async () => {
  seq += 1;
  const [{ insertId }] = await getDb()
    .insert(charityCategoryTable)
    .values({
      code: `cat-${seq}`,
      name: `類別 ${seq}`,
      sortOrder: seq,
      isActive: true,
      createdAt: new Date(),
    });
  return insertId;
};

/** One owned spirit, at max level unless a test says otherwise. */
const seedSpirit = async (userId: number, categoryId: number, level = MAX_LEVEL) => {
  const db = getDb();
  seq += 1;
  const [{ insertId: speciesId }] = await db.insert(guardianTable).values({
    code: `species-${seq}`,
    name: `第 ${seq} 之蛋`,
    theme: `主題 ${seq}`,
    cost: 20,
    categoryId,
    sortOrder: seq,
    isActive: true,
    createdAt: new Date(),
  });
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

const seedOrganization = async (name: string) => {
  const [{ insertId }] = await getDb()
    .insert(charityOrganizationTable)
    .values({
      name,
      introduction: `${name} 的簡介`,
      websiteUrl: 'https://example.org',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  return insertId;
};

const seedBatch = async (
  organizationId: number,
  {
    transferredAmount,
    transferredAt = new Date('2026-12-01T00:00:00.000Z'),
    published = true,
    reference = '8842',
  }: {
    transferredAmount: number;
    transferredAt?: Date;
    published?: boolean;
    reference?: string | null;
  }
) => {
  const [{ insertId }] = await getDb().insert(donationBatchTable).values({
    organizationId,
    transferredAmount,
    transferredAt,
    reference,
    published,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return insertId;
};

/** A confirmed donation. `batchId` null is one still awaiting payout. */
const seedDonation = async ({
  categoryId,
  organizationId,
  amount = DONATION_AMOUNT,
  batchId = null,
}: {
  categoryId: number;
  organizationId: number;
  amount?: number;
  batchId?: number | null;
}) => {
  const userId = await seedUser();
  const userGuardianId = await seedSpirit(userId, categoryId);
  const [{ insertId }] = await getDb().insert(donationTable).values({
    userId,
    userGuardianId,
    categoryId,
    organizationId,
    amount,
    batchId,
    confirmedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return insertId;
};

const seedEvidence = async (
  batchId: number,
  kind: string,
  { sortOrder = 0, caption = null }: { sortOrder?: number; caption?: string | null } = {}
) => {
  seq += 1;
  const [{ insertId }] = await getDb()
    .insert(donationBatchEvidenceTable)
    .values({
      batchId,
      kind,
      url: `https://example.com/donations/${seq}.pdf`,
      s3Key: `donations/${seq}.pdf`,
      caption,
      sortOrder,
      createdAt: new Date(),
    });
  return insertId;
};

describe('info donation record', () => {
  beforeEach(clearTables);
  afterEach(clearTables);

  afterAll(async () => {
    await closeDb();
  });

  // The point of the endpoint. Mounted in the public /api/info group, on a
  // CloudFront behavior that forwards no Authorization at all -- being
  // readable by someone who has never signed in is its value as proof.
  it('answers without any credentials', async () => {
    const res = await app.request('/api/info/donation');
    expect(res.status).toBe(200);
  });

  it('reports zeros and an empty list on an untouched database', async () => {
    const body = await getRecord();

    expect(body.data).toEqual([]);
    expect(body.paginate.total).toBe(0);
    expect(body.summary).toMatchObject({
      maxedSpiritCount: 0,
      confirmedCount: 0,
      confirmedAmount: 0,
      pendingCount: 0,
      pendingAmount: 0,
      promisedAmount: 0,
      transferredAmount: 0,
      publishedBatchCount: 0,
      donationAmount: DONATION_AMOUNT,
    });
  });

  describe('the per-batch arithmetic', () => {
    // The whole layout: 57 x NT$1,000 + NT$3,000 = NT$60,000, and the
    // receipt says NT$60,000. Three donations stand in for the 57.
    it('carries the count, the subtotal and the top-up, and they add up', async () => {
      const categoryId = await seedCategory();
      const organizationId = await seedOrganization('OO 基金會');
      const batchId = await seedBatch(organizationId, { transferredAmount: 5000 });
      for (let i = 0; i < 3; i++) await seedDonation({ categoryId, organizationId, batchId });

      const [batch] = (await getRecord()).data;
      expect(batch.donationCount).toBe(3);
      expect(batch.donationSubtotal).toBe(3 * DONATION_AMOUNT);
      expect(batch.donationUnitAmount).toBe(DONATION_AMOUNT);
      expect(batch.platformTopUp).toBe(5000 - 3 * DONATION_AMOUNT);
      expect(batch.transferredAmount).toBe(5000);
      // The identity a reader checks against the receipt.
      expect(batch.donationCount * (batch.donationUnitAmount ?? 0) + batch.platformTopUp).toBe(
        batch.transferredAmount
      );
    });

    // Counts and sums come back from mysql2 as strings for SUM(); a string
    // survives JSON.stringify and would print as "3000" on the page.
    it('returns the totals as numbers, not strings', async () => {
      const categoryId = await seedCategory();
      const organizationId = await seedOrganization('OO 基金會');
      const batchId = await seedBatch(organizationId, { transferredAmount: 2000 });
      await seedDonation({ categoryId, organizationId, batchId });

      const body = await getRecord();
      expect(typeof body.data[0].donationSubtotal).toBe('number');
      expect(typeof body.data[0].donationCount).toBe('number');
      expect(typeof body.summary.confirmedAmount).toBe('number');
      expect(typeof body.summary.transferredAmount).toBe('number');
    });

    // The multiplication is only true while every member carries the same
    // frozen amount, so the endpoint decides rather than the page guessing.
    it('reports no unit amount when the members were frozen at different amounts', async () => {
      const categoryId = await seedCategory();
      const organizationId = await seedOrganization('OO 基金會');
      const batchId = await seedBatch(organizationId, { transferredAmount: 3000 });
      await seedDonation({ categoryId, organizationId, batchId, amount: 1000 });
      await seedDonation({ categoryId, organizationId, batchId, amount: 500 });

      const [batch] = (await getRecord()).data;
      expect(batch.donationUnitAmount).toBeNull();
      expect(batch.donationSubtotal).toBe(1500);
      expect(batch.donationCount).toBe(2);
    });

    // Admin must refuse to publish an underpaid batch (step 5). If one
    // ever slips through, clamping the top-up at zero would break the only
    // arithmetic this page exists for, so the negative passes through.
    it('passes a negative top-up through rather than clamping it', async () => {
      const categoryId = await seedCategory();
      const organizationId = await seedOrganization('OO 基金會');
      const batchId = await seedBatch(organizationId, { transferredAmount: 1500 });
      await seedDonation({ categoryId, organizationId, batchId });
      await seedDonation({ categoryId, organizationId, batchId });

      const [batch] = (await getRecord()).data;
      expect(batch.platformTopUp).toBe(-500);
      expect(batch.donationCount * (batch.donationUnitAmount ?? 0) + batch.platformTopUp).toBe(
        batch.transferredAmount
      );
    });

    it('handles a batch with no members at all', async () => {
      const organizationId = await seedOrganization('OO 基金會');
      await seedBatch(organizationId, { transferredAmount: 400 });

      const [batch] = (await getRecord()).data;
      expect(batch.donationCount).toBe(0);
      expect(batch.donationSubtotal).toBe(0);
      expect(batch.donationUnitAmount).toBeNull();
      expect(batch.platformTopUp).toBe(400);
    });

    it('does not mix one batch members into another', async () => {
      const categoryId = await seedCategory();
      const organizationId = await seedOrganization('OO 基金會');
      const first = await seedBatch(organizationId, {
        transferredAmount: 1000,
        transferredAt: new Date('2026-12-01T00:00:00.000Z'),
      });
      const second = await seedBatch(organizationId, {
        transferredAmount: 2000,
        transferredAt: new Date('2026-12-02T00:00:00.000Z'),
      });
      await seedDonation({ categoryId, organizationId, batchId: first });
      await seedDonation({ categoryId, organizationId, batchId: second });
      await seedDonation({ categoryId, organizationId, batchId: second });
      // Confirmed but unpaid: belongs to no batch and must stay out of both.
      await seedDonation({ categoryId, organizationId });

      const byId = new Map((await getRecord()).data.map((batch) => [batch.id, batch]));
      expect(byId.get(first)?.donationCount).toBe(1);
      expect(byId.get(second)?.donationCount).toBe(2);
    });
  });

  describe('what is published', () => {
    it('lists published batches only', async () => {
      const organizationId = await seedOrganization('OO 基金會');
      const shown = await seedBatch(organizationId, { transferredAmount: 1000 });
      await seedBatch(organizationId, { transferredAmount: 9000, published: false });

      const body = await getRecord();
      expect(body.data.map((batch) => batch.id)).toEqual([shown]);
      expect(body.paginate.total).toBe(1);
    });

    // Taken over the same filter as the list, so adding up the batches a
    // reader can see reproduces the headline figure.
    it('counts only published batches in the transferred total', async () => {
      const organizationId = await seedOrganization('OO 基金會');
      await seedBatch(organizationId, { transferredAmount: 1000 });
      await seedBatch(organizationId, {
        transferredAmount: 2000,
        transferredAt: new Date('2026-12-02T00:00:00.000Z'),
      });
      await seedBatch(organizationId, { transferredAmount: 9000, published: false });

      const body = await getRecord();
      expect(body.summary.transferredAmount).toBe(3000);
      expect(body.data.reduce((sum, batch) => sum + batch.transferredAmount, 0)).toBe(
        body.summary.transferredAmount
      );
    });
  });

  describe('the promised total', () => {
    // The consequence of creating the donation row at confirmation rather
    // than at max level: a maxed spirit whose owner has not chosen yet is
    // invisible to SUM(donation.amount), and is already owed.
    it('includes maxed spirits that have not chosen an organisation yet', async () => {
      const categoryId = await seedCategory();
      const organizationId = await seedOrganization('OO 基金會');
      await seedDonation({ categoryId, organizationId });
      // Two more maxed spirits, neither of them with a donation row.
      const waiting = await seedUser();
      await seedSpirit(waiting, categoryId);
      await seedSpirit(waiting, categoryId);

      const body = await getRecord();
      expect(body.summary.maxedSpiritCount).toBe(3);
      expect(body.summary.confirmedCount).toBe(1);
      expect(body.summary.confirmedAmount).toBe(DONATION_AMOUNT);
      expect(body.summary.pendingCount).toBe(2);
      expect(body.summary.pendingAmount).toBe(2 * DONATION_AMOUNT);
      expect(body.summary.promisedAmount).toBe(3 * DONATION_AMOUNT);
    });

    // Only the unchosen half is priced at today's figure. What was chosen
    // is summed from the frozen amounts, so moving DONATION_AMOUNT later
    // cannot rewrite what the page already said was promised.
    it('sums what was chosen from the frozen amounts, not from the constant', async () => {
      const categoryId = await seedCategory();
      const organizationId = await seedOrganization('OO 基金會');
      await seedDonation({ categoryId, organizationId, amount: 10 });

      const body = await getRecord();
      expect(body.summary.confirmedAmount).toBe(10);
      expect(body.summary.pendingCount).toBe(0);
      expect(body.summary.promisedAmount).toBe(10);
    });

    it('ignores spirits that have not reached max level', async () => {
      const categoryId = await seedCategory();
      const userId = await seedUser();
      await seedSpirit(userId, categoryId, MAX_LEVEL - 1);

      const body = await getRecord();
      expect(body.summary.maxedSpiritCount).toBe(0);
      expect(body.summary.promisedAmount).toBe(0);
    });
  });

  describe('evidence and ordering', () => {
    it('groups evidence under its own batch, in sort order', async () => {
      const organizationId = await seedOrganization('OO 基金會');
      const batchId = await seedBatch(organizationId, { transferredAmount: 1000 });
      const other = await seedBatch(organizationId, {
        transferredAmount: 2000,
        transferredAt: new Date('2026-12-02T00:00:00.000Z'),
      });
      await seedEvidence(batchId, 'ORG_RECEIPT', { sortOrder: 2 });
      await seedEvidence(batchId, 'TRANSFER_RECEIPT', { sortOrder: 1 });
      await seedEvidence(other, 'THANK_YOU_LETTER', { sortOrder: 1 });

      const byId = new Map((await getRecord()).data.map((batch) => [batch.id, batch]));
      expect(byId.get(batchId)?.evidence.map((item) => item.kind)).toEqual([
        'TRANSFER_RECEIPT',
        'ORG_RECEIPT',
      ]);
      expect(byId.get(other)?.evidence.map((item) => item.kind)).toEqual(['THANK_YOU_LETTER']);
    });

    it('leaves evidence empty for a batch with none attached', async () => {
      const organizationId = await seedOrganization('OO 基金會');
      await seedBatch(organizationId, { transferredAmount: 1000 });

      expect((await getRecord()).data[0].evidence).toEqual([]);
    });

    it('names the recipient so the page can print it without a second call', async () => {
      const organizationId = await seedOrganization('財團法人 OO 基金會');
      await seedBatch(organizationId, { transferredAmount: 1000 });

      const [batch] = (await getRecord()).data;
      expect(batch.organization).toMatchObject({
        id: organizationId,
        name: '財團法人 OO 基金會',
        websiteUrl: 'https://example.org',
      });
      expect(batch.reference).toBe('8842');
    });

    it('lists the newest transfer first, and reverses on order=asc', async () => {
      const organizationId = await seedOrganization('OO 基金會');
      const older = await seedBatch(organizationId, {
        transferredAmount: 1000,
        transferredAt: new Date('2026-11-01T00:00:00.000Z'),
      });
      const newer = await seedBatch(organizationId, {
        transferredAmount: 2000,
        transferredAt: new Date('2026-12-01T00:00:00.000Z'),
      });

      expect((await getRecord()).data.map((batch) => batch.id)).toEqual([newer, older]);
      expect((await getRecord('?order=asc')).data.map((batch) => batch.id)).toEqual([
        older,
        newer,
      ]);
    });

    // Same transferredAt is the normal case, and without an id tiebreaker
    // the order of those rows is unspecified -- so a paginated list can
    // repeat or skip rows between pages.
    //
    // Asserting the order, not just the absence of duplicates: MySQL
    // returns same-day rows in ascending id order of its own accord, so a
    // de-duplication check passes with the tiebreaker deleted. The
    // descending order below is only true because it is there.
    it('breaks a same-day tie by id, so paging cannot repeat or skip', async () => {
      const organizationId = await seedOrganization('OO 基金會');
      const sameDay = new Date('2026-12-01T00:00:00.000Z');
      const ids = [];
      for (let i = 0; i < 3; i++) {
        ids.push(await seedBatch(organizationId, { transferredAmount: 1000, transferredAt: sameDay }));
      }

      const first = await getRecord('?limit=2&offset=0');
      const second = await getRecord('?limit=2&offset=2');
      const paged = [...first.data, ...second.data].map((batch) => batch.id);
      expect(paged).toEqual([...ids].reverse());
      expect(first.paginate.total).toBe(3);
    });

    it('rejects a limit beyond the cap', async () => {
      expect((await app.request('/api/info/donation?limit=1001')).status).toBe(400);
    });
  });
});
