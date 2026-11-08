import { eq, isNull } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { MAX_LEVEL } from 'src/lib/guardianLevel';
import { ADMIN_EMAILS } from 'src/middleware/adminAuth';

vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdToken: vi.fn(), verifyIdTokenUid: vi.fn() }));
import { verifyIdToken } from 'src/lib/firebaseAdmin';

// Mocked because the real thing talks to AWS. The *key* is what these
// tests assert on: it decides whether the object is publicly readable
// (the bucket policy is prefix-scoped) and it is the only handle
// deleteFromS3 has, so a wrong key fails silently in production.
vi.mock('src/lib/s3', () => ({ uploadToS3: vi.fn(), deleteFromS3: vi.fn() }));
import { deleteFromS3, uploadToS3 } from 'src/lib/s3';

type EvidenceDto = {
  id: number;
  kind: string;
  url: string;
  s3Key: string;
  caption: string | null;
  sortOrder: number;
};
type BatchDto = {
  id: number;
  organization: { id: number; name: string } | null;
  transferredAmount: number;
  transferredAt: string;
  reference: string | null;
  note: string | null;
  published: boolean;
  donationCount: number;
  donationSubtotal: number;
  platformTopUp: number;
  evidence: EvidenceDto[];
  donations?: { id: number; userId: number; amount: number }[];
};
type ErrorBody = { code?: string };

const base = '/api/donation-batch';

const getUnpaid = (query: string) => app.request(`${base}/unpaid${query}`);
const getBatches = (query = '') => app.request(`${base}${query}`);
const getBatch = (id: number) => app.request(`${base}/${id}`);
const postBatch = (body: unknown) =>
  app.request(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const putBatch = (id: number, body: unknown) =>
  app.request(`${base}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const postEvidence = (id: number, body: unknown) =>
  app.request(`${base}/${id}/evidence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const deleteEvidence = (id: number, evidenceId: number) =>
  app.request(`${base}/${id}/evidence/${evidenceId}`, { method: 'DELETE' });
const publish = (id: number) => app.request(`${base}/${id}/publish`, { method: 'PUT' });
const unpublish = (id: number) => app.request(`${base}/${id}/unpublish`, { method: 'PUT' });
const deleteBatch = (id: number) => app.request(`${base}/${id}`, { method: 'DELETE' });

// FK-safe order: evidence -> donation -> batch -> org links -> org ->
// spirits -> species -> users -> categories (guardian points at
// charity_category, so categories go last).
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
  const db = getDb();
  seq += 1;
  const [{ insertId }] = await db.insert(userTable).values({
    firebaseUid: `donor-${seq}`,
    email: `donor-${seq}@example.com`,
    name: `donor ${seq}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return insertId;
};

const seedCategory = async () => {
  const db = getDb();
  seq += 1;
  const [{ insertId }] = await db.insert(charityCategoryTable).values({
    code: `cat-${seq}`,
    name: `類別 ${seq}`,
    // Flat 0, like the species below: charity_category.sort_order is
    // TINYINT UNSIGNED, and this file seeds a category plus a species per
    // donation, so `seq` passes 255 before the suite ends. Nothing here
    // asserts on category ordering, so there is nothing to lose.
    sortOrder: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return insertId;
};

const seedSpirit = async (userId: number, categoryId: number) => {
  const db = getDb();
  seq += 1;
  const [{ insertId: speciesId }] = await db.insert(guardianTable).values({
    code: `species-${seq}`,
    name: `第 ${seq} 之蛋`,
    theme: `主題 ${seq}`,
    cost: 10,
    categoryId,
    // Flat 0, not seq: guardian.sort_order is TINYINT UNSIGNED and this
    // file seeds one species per donation, so the counter passes 255
    // partway through the suite and the insert starts failing on a test
    // that has nothing to do with ordering.
    sortOrder: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const [{ insertId }] = await db.insert(userGuardianTable).values({
    userId,
    guardianId: speciesId,
    level: MAX_LEVEL,
    xp: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return insertId;
};

const seedOrganization = async (categoryId: number) => {
  const db = getDb();
  seq += 1;
  const [{ insertId }] = await db.insert(charityOrganizationTable).values({
    name: `第 ${seq} 基金會`,
    introduction: '簡介',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db
    .insert(charityOrganizationCategoryTable)
    .values([{ organizationId: insertId, categoryId }]);
  return insertId;
};

/** One confirmed donation awaiting payout. */
const seedDonation = async (
  organizationId: number,
  categoryId: number,
  options: { amount?: number; batchId?: number; confirmedAt?: Date } = {}
) => {
  const db = getDb();
  const userId = await seedUser();
  const userGuardianId = await seedSpirit(userId, categoryId);
  const [{ insertId }] = await db.insert(donationTable).values({
    userId,
    userGuardianId,
    categoryId,
    organizationId,
    amount: options.amount ?? 1000,
    batchId: options.batchId ?? null,
    confirmedAt: options.confirmedAt ?? new Date('2026-11-01T00:00:00.000Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { id: insertId, userId };
};

/** A batch written straight to the table, for states the API cannot create. */
const seedBatch = async (
  organizationId: number,
  overrides: Partial<typeof donationBatchTable.$inferInsert> = {}
) => {
  const db = getDb();
  const [{ insertId }] = await db.insert(donationBatchTable).values({
    organizationId,
    transferredAmount: 1000,
    transferredAt: new Date('2026-11-05T00:00:00.000Z'),
    published: false,
    createdAt: new Date(),
    updatedAt: null,
    ...overrides,
  });
  return insertId;
};

const PNG_BASE64 = 'iVBORw0KGgo=';

const validEvidence = (overrides: Record<string, unknown> = {}) => ({
  kind: 'TRANSFER_RECEIPT',
  mimeType: 'image/png',
  data: PNG_BASE64,
  ...overrides,
});

/** organisation + category + N unpaid donations, the usual starting point. */
const setupUnpaid = async (count: number, amount = 1000) => {
  const categoryId = await seedCategory();
  const organizationId = await seedOrganization(categoryId);
  const donations = [];
  for (let i = 0; i < count; i++)
    donations.push(await seedDonation(organizationId, categoryId, { amount }));
  return { categoryId, organizationId, donationIds: donations.map((d) => d.id) };
};

/** A batch that is ready to publish: enough money, one piece of evidence. */
const setupPublishable = async (count = 2, transferredAmount = 2000) => {
  const { organizationId, donationIds } = await setupUnpaid(count);
  const created = await postBatch({
    organizationId,
    transferredAmount,
    transferredAt: '2026-11-05T00:00:00.000Z',
    donationIds,
  });
  const batch = (await created.json()) as BatchDto;
  await postEvidence(batch.id, validEvidence());
  return { organizationId, donationIds, batchId: batch.id };
};

describe('donation batch routes', () => {
  beforeAll(clearTables);

  beforeEach(() => {
    vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);
    vi.mocked(uploadToS3).mockImplementation(async (_body, _contentType, key) => ({
      url: `https://bucket.s3.ap-east-2.amazonaws.com/${key}`,
      key,
    }));
    vi.mocked(deleteFromS3).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await clearTables();
  });

  afterAll(async () => {
    await closeDb();
  });

  describe('admin gate', () => {
    // requireAdmin, not adminAuth: GET /unpaid names which user is owed
    // what, so unlike the organisation catalog the reads are gated too.
    it('rejects a read with 401 when there is no identity', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);
      expect((await getBatches()).status).toBe(401);
      expect((await getUnpaid('?organizationId=1')).status).toBe(401);
    });

    it('rejects a read with 403 for a non-admin email', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue('someone@example.com');
      expect((await getBatches()).status).toBe(403);
      expect((await getUnpaid('?organizationId=1')).status).toBe(403);
    });
  });

  describe('GET /unpaid', () => {
    it('lists only this organization’s donations that have no batch', async () => {
      const { organizationId, categoryId, donationIds } = await setupUnpaid(2);
      const otherCategory = await seedCategory();
      const otherOrganization = await seedOrganization(otherCategory);
      await seedDonation(otherOrganization, otherCategory);
      const paidBatch = await seedBatch(organizationId);
      await seedDonation(organizationId, categoryId, { batchId: paidBatch });

      const res = await getUnpaid(`?organizationId=${organizationId}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: { id: number; amount: number; category: { id: number } }[];
        paginate: { total: number };
        summary: { unpaidCount: number; unpaidAmount: number };
      };
      expect(body.data.map((row) => row.id).sort()).toEqual([...donationIds].sort());
      expect(body.paginate.total).toBe(2);
      expect(body.summary).toEqual({ unpaidCount: 2, unpaidAmount: 2000 });
    });

    it('reports the whole unpaid set in summary, not just the page', async () => {
      // The admin can batch only what the page shows, so summary has to
      // describe everything outstanding or a second page goes unpaid with
      // nothing on screen hinting at it.
      const { organizationId } = await setupUnpaid(3);

      const res = await getUnpaid(`?organizationId=${organizationId}&limit=2`);
      const body = (await res.json()) as {
        data: unknown[];
        summary: { unpaidCount: number; unpaidAmount: number };
      };
      expect(body.data).toHaveLength(2);
      expect(body.summary).toEqual({ unpaidCount: 3, unpaidAmount: 3000 });
    });

    it('returns the unpaid total as a number, not a string', async () => {
      const { organizationId } = await setupUnpaid(2);
      const body = (await (await getUnpaid(`?organizationId=${organizationId}`)).json()) as {
        summary: { unpaidAmount: unknown };
      };
      expect(typeof body.summary.unpaidAmount).toBe('number');
    });

    it('answers zeros when nothing is owed', async () => {
      const categoryId = await seedCategory();
      const organizationId = await seedOrganization(categoryId);
      const body = (await (await getUnpaid(`?organizationId=${organizationId}`)).json()) as {
        data: unknown[];
        summary: { unpaidCount: number; unpaidAmount: number };
      };
      expect(body.data).toEqual([]);
      expect(body.summary).toEqual({ unpaidCount: 0, unpaidAmount: 0 });
    });

    it('breaks a same-second tie by id, so paging cannot repeat or skip', async () => {
      // Every donation here shares one confirmedAt, which is the normal
      // case for a quiet week. Without an id tiebreaker the order of those
      // rows is unspecified and a paginated list can repeat or skip one --
      // here that means paying a donation twice or not at all.
      //
      // The descending pass is the one that proves the tiebreaker exists:
      // MySQL returns same-value rows in ascending id order of its own
      // accord, so the ascending assertion below passes even with the
      // tiebreaker deleted. Only `desc` can tell the two apart.
      const categoryId = await seedCategory();
      const organizationId = await seedOrganization(categoryId);
      const sameMoment = new Date('2026-11-01T00:00:00.000Z');
      const ids = [];
      for (let i = 0; i < 3; i++)
        ids.push((await seedDonation(organizationId, categoryId, { confirmedAt: sameMoment })).id);

      const pageIds = async (query: string) => {
        const first = (await (
          await getUnpaid(`?organizationId=${organizationId}&limit=2&offset=0${query}`)
        ).json()) as { data: { id: number }[] };
        const second = (await (
          await getUnpaid(`?organizationId=${organizationId}&limit=2&offset=2${query}`)
        ).json()) as { data: { id: number }[] };
        return [...first.data, ...second.data].map((row) => row.id);
      };

      expect(await pageIds('')).toEqual(ids);
      expect(await pageIds('&order=desc')).toEqual([...ids].reverse());
    });

    it('rejects a request with no organizationId', async () => {
      expect((await getUnpaid('')).status).toBe(400);
    });
  });

  describe('POST /', () => {
    it('creates an unpublished batch and claims its donations', async () => {
      const { organizationId, donationIds } = await setupUnpaid(2);

      const res = await postBatch({
        organizationId,
        transferredAmount: 2500,
        transferredAt: '2026-11-05T00:00:00.000Z',
        reference: 'TXN-001',
        note: '打了兩次電話',
        donationIds,
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as BatchDto;
      expect(body).toMatchObject({
        organization: { id: organizationId },
        transferredAmount: 2500,
        reference: 'TXN-001',
        note: '打了兩次電話',
        published: false,
        donationCount: 2,
        donationSubtotal: 2000,
        platformTopUp: 500,
        evidence: [],
      });

      // The claim is the point: donation.batchId is the only record that
      // money went out, and nothing else may batch these again.
      const db = getDb();
      const remaining = await db
        .select({ id: donationTable.id })
        .from(donationTable)
        .where(isNull(donationTable.batchId));
      expect(remaining).toEqual([]);
    });

    it('returns the subtotal as a number, not a string', async () => {
      const { organizationId, donationIds } = await setupUnpaid(2);
      const body = (await (
        await postBatch({
          organizationId,
          transferredAmount: 2000,
          transferredAt: '2026-11-05T00:00:00.000Z',
          donationIds,
        })
      ).json()) as { donationSubtotal: unknown; platformTopUp: unknown };
      expect(typeof body.donationSubtotal).toBe('number');
      expect(typeof body.platformTopUp).toBe('number');
    });

    it('accepts an amount below the subtotal and shows the shortfall', async () => {
      // Creation is deliberately permissive: a mistyped figure on an
      // unpublished batch is a typo to fix with PUT, not a reason to throw
      // away the membership list. Publishing is what refuses it.
      const { organizationId, donationIds } = await setupUnpaid(2);
      const body = (await (
        await postBatch({
          organizationId,
          transferredAmount: 1500,
          transferredAt: '2026-11-05T00:00:00.000Z',
          donationIds,
        })
      ).json()) as BatchDto;
      expect(body.platformTopUp).toBe(-500);
    });

    it('rejects a donation that is already in a batch', async () => {
      const { organizationId, donationIds } = await setupUnpaid(1);
      await postBatch({
        organizationId,
        transferredAmount: 1000,
        transferredAt: '2026-11-05T00:00:00.000Z',
        donationIds,
      });

      const res = await postBatch({
        organizationId,
        transferredAmount: 1000,
        transferredAt: '2026-11-06T00:00:00.000Z',
        donationIds,
      });
      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrorBody).code).toBe('DONATION_ALREADY_BATCHED');
    });

    it('rejects a donation owed to a different organization', async () => {
      const { organizationId } = await setupUnpaid(1);
      const otherCategory = await seedCategory();
      const otherOrganization = await seedOrganization(otherCategory);
      const foreign = await seedDonation(otherOrganization, otherCategory);

      const res = await postBatch({
        organizationId,
        transferredAmount: 1000,
        transferredAt: '2026-11-05T00:00:00.000Z',
        donationIds: [foreign.id],
      });
      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrorBody).code).toBe('DONATION_ORGANIZATION_MISMATCH');
    });

    it('rejects a donation id that does not exist', async () => {
      const { organizationId, donationIds } = await setupUnpaid(1);
      const res = await postBatch({
        organizationId,
        transferredAmount: 1000,
        transferredAt: '2026-11-05T00:00:00.000Z',
        donationIds: [...donationIds, 999999],
      });
      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrorBody).code).toBe('DONATION_NOT_FOUND');
    });

    it('rejects a transfer date in the future', async () => {
      const { organizationId, donationIds } = await setupUnpaid(1);
      const res = await postBatch({
        organizationId,
        transferredAmount: 1000,
        transferredAt: new Date(Date.now() + 86_400_000).toISOString(),
        donationIds,
      });
      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrorBody).code).toBe('BATCH_FUTURE_TRANSFER');
    });

    it('rejects an unknown organization with 404', async () => {
      const { donationIds } = await setupUnpaid(1);
      const res = await postBatch({
        organizationId: 999999,
        transferredAmount: 1000,
        transferredAt: '2026-11-05T00:00:00.000Z',
        donationIds,
      });
      expect(res.status).toBe(404);
    });

    it('counts a repeated donation id once', async () => {
      const { organizationId, donationIds } = await setupUnpaid(1);
      const body = (await (
        await postBatch({
          organizationId,
          transferredAmount: 1000,
          transferredAt: '2026-11-05T00:00:00.000Z',
          donationIds: [donationIds[0], donationIds[0]],
        })
      ).json()) as BatchDto;
      // Without the de-duplication the existence check would see one row
      // for two requested ids and report it as missing.
      expect(body.donationCount).toBe(1);
      expect(body.donationSubtotal).toBe(1000);
    });

    it('rejects an empty donation list', async () => {
      const { organizationId } = await setupUnpaid(1);
      const res = await postBatch({
        organizationId,
        transferredAmount: 1000,
        transferredAt: '2026-11-05T00:00:00.000Z',
        donationIds: [],
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /', () => {
    it('filters by organization and by published', async () => {
      const { batchId } = await setupPublishable();
      await publish(batchId);
      const second = await setupUnpaid(1);
      await postBatch({
        organizationId: second.organizationId,
        transferredAmount: 1000,
        transferredAt: '2026-11-05T00:00:00.000Z',
        donationIds: second.donationIds,
      });

      const published = (await (await getBatches('?published=true')).json()) as {
        data: BatchDto[];
      };
      expect(published.data.map((row) => row.id)).toEqual([batchId]);

      const unpublished = (await (await getBatches('?published=false')).json()) as {
        data: BatchDto[];
      };
      expect(unpublished.data).toHaveLength(1);
      expect(unpublished.data[0].id).not.toBe(batchId);

      const byOrganization = (await (
        await getBatches(`?organizationId=${second.organizationId}`)
      ).json()) as { data: BatchDto[] };
      expect(byOrganization.data).toHaveLength(1);
    });

    it('reports zeros for a batch with no members', async () => {
      // The API cannot create one (POST requires at least one donation),
      // but the aggregate has no row for it at all -- a missing row rather
      // than a SUM of nothing, which is why the handler uses ?? 0.
      const categoryId = await seedCategory();
      const organizationId = await seedOrganization(categoryId);
      const batchId = await seedBatch(organizationId, { transferredAmount: 700 });

      const body = (await (await getBatches()).json()) as { data: BatchDto[] };
      const row = body.data.find((batch) => batch.id === batchId);
      expect(row).toMatchObject({ donationCount: 0, donationSubtotal: 0, platformTopUp: 700 });
    });

    it('does not leak one batch’s members into another', async () => {
      const first = await setupUnpaid(2);
      const a = (await (
        await postBatch({
          organizationId: first.organizationId,
          transferredAmount: 2000,
          transferredAt: '2026-11-05T00:00:00.000Z',
          donationIds: first.donationIds,
        })
      ).json()) as BatchDto;
      const second = await setupUnpaid(1);
      const b = (await (
        await postBatch({
          organizationId: second.organizationId,
          transferredAmount: 1000,
          transferredAt: '2026-11-06T00:00:00.000Z',
          donationIds: second.donationIds,
        })
      ).json()) as BatchDto;

      const body = (await (await getBatches()).json()) as { data: BatchDto[] };
      const byId = new Map(body.data.map((row) => [row.id, row]));
      expect(byId.get(a.id)).toMatchObject({ donationCount: 2, donationSubtotal: 2000 });
      expect(byId.get(b.id)).toMatchObject({ donationCount: 1, donationSubtotal: 1000 });
    });
  });

  describe('GET /:id', () => {
    it('returns the members and the evidence', async () => {
      const { batchId, donationIds } = await setupPublishable();

      const res = await getBatch(batchId);
      expect(res.status).toBe(200);
      const body = (await res.json()) as BatchDto;
      expect(body.donations?.map((row) => row.id)).toEqual(donationIds);
      expect(body.evidence).toHaveLength(1);
      expect(body.evidence[0]).toMatchObject({ kind: 'TRANSFER_RECEIPT' });
    });

    it('answers 404 for a batch that does not exist', async () => {
      expect((await getBatch(999999)).status).toBe(404);
    });
  });

  describe('PUT /:id', () => {
    it('corrects the transfer figures while unpublished', async () => {
      const { batchId } = await setupPublishable(2, 1800);

      const res = await putBatch(batchId, {
        transferredAmount: 2200,
        transferredAt: '2026-11-07T00:00:00.000Z',
        reference: 'TXN-FIXED',
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as BatchDto;
      expect(body).toMatchObject({
        transferredAmount: 2200,
        reference: 'TXN-FIXED',
        note: null,
        platformTopUp: 200,
      });
    });

    it('rejects a transfer date in the future', async () => {
      // The same guard as POST, and it needs its own test: a correction is
      // exactly where a wrong year gets typed, and the public page sorts
      // by this column.
      const { batchId } = await setupPublishable();
      const res = await putBatch(batchId, {
        transferredAmount: 2000,
        transferredAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrorBody).code).toBe('BATCH_FUTURE_TRANSFER');
    });

    it('refuses to change a published batch', async () => {
      const { batchId } = await setupPublishable();
      await publish(batchId);

      const res = await putBatch(batchId, {
        transferredAmount: 9999,
        transferredAt: '2026-11-07T00:00:00.000Z',
      });
      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrorBody).code).toBe('BATCH_PUBLISHED');
    });
  });

  describe('POST /:id/evidence', () => {
    it('stores the object under the donations/ prefix and keeps its key', async () => {
      // The prefix is load-bearing: the bucket policy grants public read
      // per prefix, so an object written elsewhere uploads fine and then
      // answers 403 to every browser with nothing logged.
      const { organizationId, donationIds } = await setupUnpaid(1);
      const batch = (await (
        await postBatch({
          organizationId,
          transferredAmount: 1000,
          transferredAt: '2026-11-05T00:00:00.000Z',
          donationIds,
        })
      ).json()) as BatchDto;

      const res = await postEvidence(batch.id, validEvidence({ caption: '匯款單', sortOrder: 2 }));
      expect(res.status).toBe(201);
      const body = (await res.json()) as EvidenceDto;
      expect(body.s3Key).toMatch(new RegExp(`^donations/${batch.id}/[0-9a-f-]+\\.png$`));
      expect(body.url).toContain(body.s3Key);
      expect(body).toMatchObject({ kind: 'TRANSFER_RECEIPT', caption: '匯款單', sortOrder: 2 });
      expect(vi.mocked(uploadToS3)).toHaveBeenCalledWith(
        expect.any(Buffer),
        'image/png',
        body.s3Key
      );
    });

    it('accepts a PDF, which is what a bank actually emails', async () => {
      const { batchId } = await setupPublishable();
      const res = await postEvidence(
        batchId,
        validEvidence({ kind: 'ORG_RECEIPT', mimeType: 'application/pdf' })
      );
      expect(res.status).toBe(201);
      expect(((await res.json()) as EvidenceDto).s3Key).toMatch(/\.pdf$/);
    });

    it('accepts a base64 data URL as well as a bare string', async () => {
      const { batchId } = await setupPublishable();
      const res = await postEvidence(
        batchId,
        validEvidence({ data: `data:image/png;base64,${PNG_BASE64}` })
      );
      expect(res.status).toBe(201);
    });

    it('is allowed on a published batch, because receipts arrive late', async () => {
      const { batchId } = await setupPublishable();
      await publish(batchId);

      const res = await postEvidence(batchId, validEvidence({ kind: 'THANK_YOU_LETTER' }));
      expect(res.status).toBe(201);
      const body = (await (await getBatch(batchId)).json()) as BatchDto;
      expect(body.evidence).toHaveLength(2);
      expect(body.published).toBe(true);
    });

    it('rejects a media type the page could not render', async () => {
      const { batchId } = await setupPublishable();
      const res = await postEvidence(batchId, validEvidence({ mimeType: 'image/heic' }));
      expect(res.status).toBe(400);
    });

    it('rejects a lower-case kind, keeping the column’s values uniform', async () => {
      const { batchId } = await setupPublishable();
      expect((await postEvidence(batchId, validEvidence({ kind: 'receipt' }))).status).toBe(400);
    });

    it('answers 404 for a batch that does not exist', async () => {
      expect((await postEvidence(999999, validEvidence())).status).toBe(404);
    });

    it('writes no row when the upload fails', async () => {
      const { batchId } = await setupPublishable();
      vi.mocked(uploadToS3).mockRejectedValueOnce(new Error('s3 is down'));

      expect((await postEvidence(batchId, validEvidence())).status).toBe(500);
      const body = (await (await getBatch(batchId)).json()) as BatchDto;
      // Still the one from setupPublishable, not two.
      expect(body.evidence).toHaveLength(1);
    });

    it('orders evidence by sortOrder, then id', async () => {
      const { batchId } = await setupPublishable();
      await postEvidence(batchId, validEvidence({ kind: 'SECOND', sortOrder: 5 }));
      await postEvidence(batchId, validEvidence({ kind: 'FIRST', sortOrder: 0 }));

      const body = (await (await getBatch(batchId)).json()) as BatchDto;
      expect(body.evidence.map((row) => row.kind)).toEqual([
        'TRANSFER_RECEIPT',
        'FIRST',
        'SECOND',
      ]);
    });
  });

  describe('DELETE /:id/evidence/:evidenceId', () => {
    it('removes the row and the object, by the stored key', async () => {
      const { batchId } = await setupPublishable();
      const body = (await (await getBatch(batchId)).json()) as BatchDto;
      const evidence = body.evidence[0];

      const res = await deleteEvidence(batchId, evidence.id);
      expect(res.status).toBe(204);
      expect(vi.mocked(deleteFromS3)).toHaveBeenCalledWith(evidence.s3Key);
      const after = (await (await getBatch(batchId)).json()) as BatchDto;
      expect(after.evidence).toEqual([]);
    });

    it('refuses on a published batch, which would leave a claim unevidenced', async () => {
      const { batchId } = await setupPublishable();
      const body = (await (await getBatch(batchId)).json()) as BatchDto;
      await publish(batchId);

      const res = await deleteEvidence(batchId, body.evidence[0].id);
      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrorBody).code).toBe('BATCH_PUBLISHED');
      expect(vi.mocked(deleteFromS3)).not.toHaveBeenCalled();
    });

    it('answers 404 when the evidence belongs to another batch', async () => {
      // Scoped to the batch in the path, so an id alone cannot reach
      // across batches.
      const first = await setupPublishable();
      const second = await setupPublishable();
      const body = (await (await getBatch(second.batchId)).json()) as BatchDto;

      const res = await deleteEvidence(first.batchId, body.evidence[0].id);
      expect(res.status).toBe(404);
      expect(vi.mocked(deleteFromS3)).not.toHaveBeenCalled();
    });

    it('keeps the row when the object cannot be deleted', async () => {
      // An S3 failure must not leave the row gone and the object behind,
      // where nothing would ever name that key again. This holds for
      // either order of the two deletes -- the handler rolls back as a
      // whole -- so it pins the outcome, not the ordering.
      const { batchId } = await setupPublishable();
      const body = (await (await getBatch(batchId)).json()) as BatchDto;
      vi.mocked(deleteFromS3).mockRejectedValueOnce(new Error('s3 is down'));

      expect((await deleteEvidence(batchId, body.evidence[0].id)).status).toBe(500);
      const after = (await (await getBatch(batchId)).json()) as BatchDto;
      expect(after.evidence).toHaveLength(1);
    });
  });

  describe('PUT /:id/publish', () => {
    it('publishes a batch that is fully paid and evidenced', async () => {
      const { batchId } = await setupPublishable();

      const res = await publish(batchId);
      expect(res.status).toBe(200);
      expect((await res.json()) as BatchDto).toMatchObject({ published: true });
    });

    it('refuses a batch that sent less than was promised', async () => {
      // This is the guard /api/info/donation relies on: it reports
      // platformTopUp with its sign rather than clamping at zero, on the
      // grounds that an underpaid batch never becomes public.
      const { batchId } = await setupPublishable(2, 1500);

      const res = await publish(batchId);
      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrorBody).code).toBe('BATCH_UNDERPAID');
    });

    it('publishes a batch that sent exactly the subtotal', async () => {
      const { batchId } = await setupPublishable(2, 2000);
      expect((await publish(batchId)).status).toBe(200);
    });

    it('refuses a batch with no evidence', async () => {
      const { organizationId, donationIds } = await setupUnpaid(1);
      const batch = (await (
        await postBatch({
          organizationId,
          transferredAmount: 1000,
          transferredAt: '2026-11-05T00:00:00.000Z',
          donationIds,
        })
      ).json()) as BatchDto;

      const res = await publish(batch.id);
      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrorBody).code).toBe('BATCH_NO_EVIDENCE');
    });

    it('refuses to publish twice', async () => {
      const { batchId } = await setupPublishable();
      await publish(batchId);

      const res = await publish(batchId);
      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrorBody).code).toBe('BATCH_ALREADY_PUBLISHED');
    });

    it('answers 404 for a batch that does not exist', async () => {
      expect((await publish(999999)).status).toBe(404);
    });

    it('makes the batch visible on the public record, and only then', async () => {
      // The cross-check that matters: /api/info/donation lists published
      // batches only, so this endpoint is the single door onto that page.
      const { batchId } = await setupPublishable();

      const before = (await (await app.request('/api/info/donation')).json()) as {
        data: { id: number }[];
      };
      expect(before.data).toEqual([]);

      await publish(batchId);
      const after = (await (await app.request('/api/info/donation')).json()) as {
        data: { id: number }[];
      };
      expect(after.data.map((row) => row.id)).toEqual([batchId]);
    });
  });

  describe('PUT /:id/unpublish', () => {
    it('takes a batch back off the public page', async () => {
      const { batchId } = await setupPublishable();
      await publish(batchId);

      const res = await unpublish(batchId);
      expect(res.status).toBe(200);
      expect((await res.json()) as BatchDto).toMatchObject({ published: false });
      const page = (await (await app.request('/api/info/donation')).json()) as { data: unknown[] };
      expect(page.data).toEqual([]);
    });

    it('refuses when the batch was never published', async () => {
      const { batchId } = await setupPublishable();
      const res = await unpublish(batchId);
      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrorBody).code).toBe('BATCH_NOT_PUBLISHED');
    });
  });

  describe('DELETE /:id', () => {
    it('releases its donations so they can be batched again', async () => {
      // The only way to fix a wrong membership list, since membership is
      // frozen once created.
      const { batchId, donationIds } = await setupPublishable();
      const body = (await (await getBatch(batchId)).json()) as BatchDto;

      const res = await deleteBatch(batchId);
      expect(res.status).toBe(204);
      expect(vi.mocked(deleteFromS3)).toHaveBeenCalledWith(body.evidence[0].s3Key);

      const db = getDb();
      const freed = await db
        .select({ id: donationTable.id })
        .from(donationTable)
        .where(isNull(donationTable.batchId));
      expect(freed.map((row) => row.id).sort()).toEqual([...donationIds].sort());
      const evidence = await db
        .select({ id: donationBatchEvidenceTable.id })
        .from(donationBatchEvidenceTable)
        .where(eq(donationBatchEvidenceTable.batchId, batchId));
      expect(evidence).toEqual([]);
    });

    it('refuses to delete a published batch', async () => {
      const { batchId } = await setupPublishable();
      await publish(batchId);

      const res = await deleteBatch(batchId);
      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrorBody).code).toBe('BATCH_PUBLISHED');
    });

    it('answers 404 for a batch that does not exist', async () => {
      expect((await deleteBatch(999999)).status).toBe(404);
    });
  });
});
