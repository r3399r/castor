import { zValidator } from '@hono/zod-validator';
import { randomUUID } from 'crypto';
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  charityCategoryTable,
  charityOrganizationTable,
  donationBatchEvidenceTable,
  donationBatchTable,
  donationTable,
} from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT } from 'src/lib/paginator';
import { deleteFromS3, uploadToS3 } from 'src/lib/s3';
import { TransactionEnv } from 'src/middleware/transaction';
import { BadRequestError, NotFoundError } from 'src/model/error';

/**
 * The payout side of the donation feature: admin only, all of it.
 *
 * Mounted behind requireAdmin rather than adminAuth, which lets GETs
 * through -- GET /unpaid lists which user owes which amount, so an open
 * read here would publish per-user donation data. The *public* view of the
 * same payouts is GET /api/info/donation, which deliberately shows batches
 * and never users.
 *
 * The workflow this exists to serve, in order:
 *   1. GET /unpaid?organizationId=N   -- what is owed to this foundation
 *   2. POST /                          -- record the transfer, unpublished
 *   3. POST /:id/evidence              -- the slip, the receipt, the letter
 *   4. PUT /:id/publish                -- only now does the public see it
 *
 * Steps 2 and 4 are separate on purpose: between them the batch exists,
 * holds its donations, and is invisible. Publishing is the irreversible-
 * feeling act, so it is the one with the guards.
 */

type Db = TransactionEnv['Variables']['db'];

// Both image types (a photographed slip) and PDF (what a bank or a
// foundation actually emails) are accepted. The consequence belongs to
// whoever renders this: a PDF cannot be an <img> source, so the public
// page has to branch on the type rather than assume a picture.
const EVIDENCE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

const EVIDENCE_EXTENSIONS: Record<(typeof EVIDENCE_MIME_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

// Same ceiling and normalisation as question.ts's figure upload: browsers
// hand back either a bare base64 string or a full data URL depending on
// how the file was read, and base64's 4/3 inflation is what brings API
// Gateway's 10MB body cap into play. Rejecting oversize here turns an
// opaque gateway 413 into a normal 400.
const MAX_EVIDENCE_BASE64_LENGTH = 2_500_000;
const base64FileSchema = z
  .string()
  .min(1)
  .max(MAX_EVIDENCE_BASE64_LENGTH)
  .transform((value) => value.replace(/^data:[^;,]*;base64,/, '').replace(/\s+/g, ''))
  .refine((value) => value.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value), {
    message: 'data must be base64 or a base64 data URL',
  });

export const donationBatchBodySchema = z.object({
  organizationId: z.number().int().positive(),
  // What actually left the bank account, which is not necessarily the
  // donations' subtotal -- the platform routinely rounds up. Underpayment
  // is checked at publish time, not here: a wrong figure typed into an
  // unpublished batch is a typo to fix with PUT, not a reason to lose the
  // membership list that was just assembled.
  transferredAmount: z.number().int().positive(),
  transferredAt: z.coerce.date(),
  reference: z.string().max(100).nullish(),
  note: z.string().nullish(),
  // Explicit rather than "every unpaid donation for this organisation":
  // the admin pays what they saw on screen, and a donation confirmed
  // between loading the list and submitting it must not be swept into a
  // transfer that did not cover it.
  donationIds: z.array(z.number().int().positive()).min(1),
});

export const donationBatchUpdateBodySchema = z.object({
  transferredAmount: z.number().int().positive(),
  transferredAt: z.coerce.date(),
  reference: z.string().max(100).nullish(),
  note: z.string().nullish(),
});

export const donationBatchEvidenceBodySchema = z.object({
  // A varchar in the schema, not an enum, so a new kind of proof needs no
  // migration -- the shape is constrained here instead. TRANSFER_RECEIPT,
  // ORG_RECEIPT and THANK_YOU_LETTER are the three in use.
  kind: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'must be an UPPER_SNAKE_CASE identifier'),
  mimeType: z.enum(EVIDENCE_MIME_TYPES),
  data: base64FileSchema,
  caption: z.string().max(255).nullish(),
  sortOrder: z.number().int().min(0).max(32767).optional().default(0),
});

export const donationBatchListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  organizationId: z.coerce.number().int().positive().optional(),
  // The two literal strings rather than z.coerce.boolean(), which maps
  // every non-empty query value -- "false" included -- to true.
  published: z.enum(['true', 'false']).optional(),
});

export const unpaidDonationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
  organizationId: z.coerce.number().int().positive(),
});

// mysql2 hands back a bare SUM() over an INT column as a *string*, which
// would survive JSON.stringify and reach the admin page as "57000" --
// where it would then concatenate instead of adding. Every aggregate below
// is cast to signed in SQL, the same way info.ts's are; a new one added
// here needs the same cast or it will quietly start returning text.
const sumSigned = (column: typeof donationTable.amount) =>
  sql<number>`cast(coalesce(sum(${column}), 0) as signed)`;

const findBatch = async (db: Db, id: number) => {
  const [found] = await db.select().from(donationBatchTable).where(eq(donationBatchTable.id, id));
  if (found === undefined) throw new NotFoundError(`donation batch ${id} not found`);
  return found;
};

/**
 * A published batch is part of the public record, so it is frozen.
 *
 * The one deliberate exception is adding evidence: a foundation's receipt
 * and its thank-you letter routinely arrive weeks after the transfer, and
 * forcing the batch back into hiding to attach them would retract a
 * payout that genuinely happened.
 */
const assertUnpublished = (batch: typeof donationBatchTable.$inferSelect) => {
  if (batch.published)
    throw new BadRequestError(
      `donation batch ${batch.id} is published and cannot be changed`,
      'BATCH_PUBLISHED'
    );
};

/** Members' count and frozen subtotal, for one batch. */
const memberTotals = async (db: Db, batchId: number) => {
  const [row] = await db
    .select({ donationCount: count(), subtotal: sumSigned(donationTable.amount) })
    .from(donationTable)
    .where(eq(donationTable.batchId, batchId));
  return { donationCount: row.donationCount, subtotal: row.subtotal };
};

/** The same, for several batches at once, keyed by batch. */
const memberTotalsByBatch = async (db: Db, batchIds: number[]) => {
  const byBatch = new Map<number, { donationCount: number; subtotal: number }>();
  if (batchIds.length === 0) return byBatch;

  const rows = await db
    .select({
      batchId: donationTable.batchId,
      donationCount: count(),
      subtotal: sumSigned(donationTable.amount),
    })
    .from(donationTable)
    .where(inArray(donationTable.batchId, batchIds))
    .groupBy(donationTable.batchId);
  for (const row of rows)
    if (row.batchId !== null)
      byBatch.set(row.batchId, { donationCount: row.donationCount, subtotal: row.subtotal });
  return byBatch;
};

type EvidenceDto = {
  id: number;
  kind: string;
  url: string;
  s3Key: string;
  caption: string | null;
  sortOrder: number;
  createdAt: Date | null;
};

const evidenceByBatch = async (db: Db, batchIds: number[]) => {
  const byBatch = new Map<number, EvidenceDto[]>();
  if (batchIds.length === 0) return byBatch;

  const rows = await db
    .select()
    .from(donationBatchEvidenceTable)
    .where(inArray(donationBatchEvidenceTable.batchId, batchIds))
    .orderBy(asc(donationBatchEvidenceTable.sortOrder), asc(donationBatchEvidenceTable.id));
  for (const row of rows) {
    const list = byBatch.get(row.batchId) ?? [];
    list.push({
      id: row.id,
      kind: row.kind,
      url: row.url,
      s3Key: row.s3Key,
      caption: row.caption,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
    });
    byBatch.set(row.batchId, list);
  }
  return byBatch;
};

const buildBatchDto = (
  batch: typeof donationBatchTable.$inferSelect,
  organization: { id: number; name: string } | null,
  totals: { donationCount: number; subtotal: number },
  evidence: EvidenceDto[]
) => ({
  id: batch.id,
  organization,
  transferredAmount: batch.transferredAmount,
  transferredAt: batch.transferredAt,
  reference: batch.reference,
  // Present here and absent from the public response on purpose: the note
  // is an internal memo ("called their finance office twice"), not part of
  // the record being published.
  note: batch.note,
  published: batch.published,
  donationCount: totals.donationCount,
  donationSubtotal: totals.subtotal,
  // Signed, deliberately not clamped: a negative top-up is exactly what
  // the publish guard refuses, so hiding it here would hide the reason the
  // button is going to say no.
  platformTopUp: batch.transferredAmount - totals.subtotal,
  evidence,
  createdAt: batch.createdAt,
  updatedAt: batch.updatedAt,
});

export const donationBatch = new Hono<TransactionEnv>()
  /**
   * What is still owed to one foundation -- the starting point of a payout.
   *
   * Paginated like every other list, which means the admin can create a
   * batch covering only the page they are looking at. `summary` therefore
   * reports the whole unpaid set, not the page, so a second page cannot go
   * unnoticed.
   */
  .get('/unpaid', zValidator('query', unpaidDonationQuerySchema), async (c) => {
    const { limit, offset, order, organizationId } = c.req.valid('query');
    console.log(
      `GET /api/donation-batch/unpaid organizationId=${organizationId} limit=${limit} offset=${offset} order=${order}`
    );
    const db = c.get('db');

    const where = and(
      eq(donationTable.organizationId, organizationId),
      // batchId NULL is the entire state machine -- there is no status
      // column to disagree with it.
      isNull(donationTable.batchId)
    );

    const [{ total }] = await db.select({ total: count() }).from(donationTable).where(where);
    const [{ unpaidAmount }] = await db
      .select({ unpaidAmount: sumSigned(donationTable.amount) })
      .from(donationTable)
      .where(where);

    const rows = await db
      .select({
        id: donationTable.id,
        userId: donationTable.userId,
        amount: donationTable.amount,
        confirmedAt: donationTable.confirmedAt,
        categoryId: charityCategoryTable.id,
        categoryName: charityCategoryTable.name,
      })
      .from(donationTable)
      .innerJoin(charityCategoryTable, eq(charityCategoryTable.id, donationTable.categoryId))
      .where(where)
      // id as the tiebreaker: several donations are confirmed per second
      // in a busy minute, and without it a paginated list can repeat or
      // skip rows between pages -- which here would mean paying one
      // donation twice or not at all.
      .orderBy(
        order === 'desc' ? desc(donationTable.confirmedAt) : asc(donationTable.confirmedAt),
        order === 'desc' ? desc(donationTable.id) : asc(donationTable.id)
      )
      .limit(limit)
      .offset(offset);

    return c.json({
      data: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        amount: row.amount,
        confirmedAt: row.confirmedAt,
        category: { id: row.categoryId, name: row.categoryName },
      })),
      paginate: genPagination(total, limit, offset),
      summary: { unpaidCount: total, unpaidAmount },
    });
  })
  .get('/', zValidator('query', donationBatchListQuerySchema), async (c) => {
    const { limit, offset, order, organizationId, published } = c.req.valid('query');
    console.log(
      `GET /api/donation-batch limit=${limit} offset=${offset} order=${order} organizationId=${organizationId ?? ''} published=${published ?? ''}`
    );
    const db = c.get('db');

    const conditions = [];
    if (organizationId !== undefined)
      conditions.push(eq(donationBatchTable.organizationId, organizationId));
    if (published !== undefined)
      conditions.push(eq(donationBatchTable.published, published === 'true'));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db
      .select({ total: count() })
      .from(donationBatchTable)
      .where(where);

    const rows = await db
      .select({
        batch: donationBatchTable,
        organizationName: charityOrganizationTable.name,
      })
      .from(donationBatchTable)
      .innerJoin(
        charityOrganizationTable,
        eq(charityOrganizationTable.id, donationBatchTable.organizationId)
      )
      .where(where)
      .orderBy(
        order === 'desc' ? desc(donationBatchTable.transferredAt) : asc(donationBatchTable.transferredAt),
        order === 'desc' ? desc(donationBatchTable.id) : asc(donationBatchTable.id)
      )
      .limit(limit)
      .offset(offset);

    const batchIds = rows.map((row) => row.batch.id);
    const totals = await memberTotalsByBatch(db, batchIds);
    const evidence = await evidenceByBatch(db, batchIds);

    const data = rows.map((row) =>
      buildBatchDto(
        row.batch,
        { id: row.batch.organizationId, name: row.organizationName },
        // No row at all when a batch has no members, which is a missing
        // row rather than a SUM of nothing -- hence ?? rather than a cast.
        totals.get(row.batch.id) ?? { donationCount: 0, subtotal: 0 },
        evidence.get(row.batch.id) ?? []
      )
    );

    return c.json({ data, paginate: genPagination(total, limit, offset) });
  })
  .get('/:id', async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`GET /api/donation-batch/${id}`);

    const batch = await findBatch(db, id);
    const [organization] = await db
      .select({ id: charityOrganizationTable.id, name: charityOrganizationTable.name })
      .from(charityOrganizationTable)
      .where(eq(charityOrganizationTable.id, batch.organizationId));

    const members = await db
      .select({
        id: donationTable.id,
        userId: donationTable.userId,
        amount: donationTable.amount,
        confirmedAt: donationTable.confirmedAt,
        categoryId: charityCategoryTable.id,
        categoryName: charityCategoryTable.name,
      })
      .from(donationTable)
      .innerJoin(charityCategoryTable, eq(charityCategoryTable.id, donationTable.categoryId))
      .where(eq(donationTable.batchId, id))
      .orderBy(asc(donationTable.id));

    const totals = await memberTotals(db, id);
    const evidence = await evidenceByBatch(db, [id]);

    return c.json({
      ...buildBatchDto(batch, organization ?? null, totals, evidence.get(id) ?? []),
      donations: members.map((row) => ({
        id: row.id,
        userId: row.userId,
        amount: row.amount,
        confirmedAt: row.confirmedAt,
        category: { id: row.categoryId, name: row.categoryName },
      })),
    });
  })
  .post('/', zValidator('json', donationBatchBodySchema), async (c) => {
    const body = c.req.valid('json');
    const db = c.get('db');
    console.log(
      `POST /api/donation-batch organizationId=${body.organizationId} amount=${body.transferredAmount} donations=${body.donationIds.length}`
    );

    const [organization] = await db
      .select({ id: charityOrganizationTable.id })
      .from(charityOrganizationTable)
      .where(eq(charityOrganizationTable.id, body.organizationId));
    if (organization === undefined)
      throw new NotFoundError(`charity organization ${body.organizationId} not found`);

    // A future transfer date is a typo rather than a plan: this records
    // money that has already moved, and the public page sorts by it.
    if (body.transferredAt.getTime() > Date.now())
      throw new BadRequestError('transferredAt is in the future', 'BATCH_FUTURE_TRANSFER');

    const donationIds = [...new Set(body.donationIds)];
    const donations = await db
      .select({
        id: donationTable.id,
        organizationId: donationTable.organizationId,
        batchId: donationTable.batchId,
      })
      .from(donationTable)
      .where(inArray(donationTable.id, donationIds));
    if (donations.length !== donationIds.length) {
      const found = new Set(donations.map((row) => row.id));
      const missing = donationIds.filter((id) => !found.has(id));
      throw new BadRequestError(`donation ${missing.join(',')} does not exist`, 'DONATION_NOT_FOUND');
    }

    // Wrong foundation: these amounts are owed to somebody else, and a
    // transfer to this one does not discharge them.
    const foreign = donations.filter((row) => row.organizationId !== body.organizationId);
    if (foreign.length > 0)
      throw new BadRequestError(
        `donation ${foreign.map((row) => row.id).join(',')} belongs to another organization`,
        'DONATION_ORGANIZATION_MISMATCH'
      );

    // Already paid: donation.batchId is the only record that money went
    // out for it, so re-batching one would double-count it in the public
    // total and in whichever batch claimed it first.
    const taken = donations.filter((row) => row.batchId !== null);
    if (taken.length > 0)
      throw new BadRequestError(
        `donation ${taken.map((row) => row.id).join(',')} is already in a batch`,
        'DONATION_ALREADY_BATCHED'
      );

    const now = new Date();
    const [inserted] = await db.insert(donationBatchTable).values({
      organizationId: body.organizationId,
      transferredAmount: body.transferredAmount,
      transferredAt: body.transferredAt,
      reference: body.reference ?? null,
      note: body.note ?? null,
      published: false,
      createdAt: now,
      updatedAt: null,
    });
    const batchId = inserted.insertId;

    await db
      .update(donationTable)
      .set({ batchId, updatedAt: now })
      .where(inArray(donationTable.id, donationIds));

    const batch = await findBatch(db, batchId);
    const totals = await memberTotals(db, batchId);
    const [organizationRow] = await db
      .select({ id: charityOrganizationTable.id, name: charityOrganizationTable.name })
      .from(charityOrganizationTable)
      .where(eq(charityOrganizationTable.id, body.organizationId));

    return c.json(buildBatchDto(batch, organizationRow ?? null, totals, []), 201);
  })
  /**
   * Corrects the transfer figures of an unpublished batch.
   *
   * Membership is not editable: donationBatch's own schema comment calls a
   * batch's membership frozen once created, and the public page's
   * arithmetic identity depends on it. To fix the wrong set of donations,
   * DELETE the batch -- which releases them -- and build it again.
   */
  .put('/:id', zValidator('json', donationBatchUpdateBodySchema), async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    const body = c.req.valid('json');
    console.log(`PUT /api/donation-batch/${id} amount=${body.transferredAmount}`);

    const batch = await findBatch(db, id);
    assertUnpublished(batch);
    if (body.transferredAt.getTime() > Date.now())
      throw new BadRequestError('transferredAt is in the future', 'BATCH_FUTURE_TRANSFER');

    const now = new Date();
    await db
      .update(donationBatchTable)
      .set({
        transferredAmount: body.transferredAmount,
        transferredAt: body.transferredAt,
        reference: body.reference ?? null,
        note: body.note ?? null,
        updatedAt: now,
      })
      .where(eq(donationBatchTable.id, id));

    const updated = await findBatch(db, id);
    const totals = await memberTotals(db, id);
    const [organization] = await db
      .select({ id: charityOrganizationTable.id, name: charityOrganizationTable.name })
      .from(charityOrganizationTable)
      .where(eq(charityOrganizationTable.id, updated.organizationId));
    const evidence = await evidenceByBatch(db, [id]);

    return c.json(buildBatchDto(updated, organization ?? null, totals, evidence.get(id) ?? []));
  })
  /**
   * Attaches one proof document.
   *
   * Allowed on a published batch, unlike every other write here: the
   * organisation's receipt and its thank-you letter arrive weeks after the
   * money does, and hiding a real payout again just to append them would
   * be worse than letting the published record grow.
   */
  .post('/:id/evidence', zValidator('json', donationBatchEvidenceBodySchema), async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    const { kind, mimeType, data, caption, sortOrder } = c.req.valid('json');
    const buffer = Buffer.from(data, 'base64');
    console.log(
      `POST /api/donation-batch/${id}/evidence kind=${kind} mimeType=${mimeType} bytes=${buffer.length}`
    );

    const batch = await findBatch(db, id);

    // Under donations/, which the bucket policy does NOT yet grant public
    // read on -- it covers questions/* only, is hand-maintained and is not
    // in CloudFormation. Until it is extended, these objects upload fine
    // and then answer 403 to every browser, with nothing logged anywhere.
    // The prefix is still the right one to write: the alternative is
    // storing proof under questions/, where a blanket cleanup would
    // eventually delete it.
    const key = `donations/${batch.id}/${randomUUID()}.${EVIDENCE_EXTENSIONS[mimeType]}`;
    const { url } = await uploadToS3(buffer, mimeType, key);

    const [inserted] = await db.insert(donationBatchEvidenceTable).values({
      batchId: batch.id,
      kind,
      url,
      // Stored rather than parsed back out of the URL later: deleteFromS3
      // takes a key, and deriving one from a URL breaks silently the
      // moment the bucket or the region changes.
      s3Key: key,
      caption: caption ?? null,
      sortOrder,
      createdAt: new Date(),
    });

    const [row] = await db
      .select()
      .from(donationBatchEvidenceTable)
      .where(eq(donationBatchEvidenceTable.id, inserted.insertId));

    return c.json(
      {
        id: row.id,
        kind: row.kind,
        url: row.url,
        s3Key: row.s3Key,
        caption: row.caption,
        sortOrder: row.sortOrder,
        createdAt: row.createdAt,
      },
      201
    );
  })
  .delete('/:id/evidence/:evidenceId', async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    const evidenceId = Number(c.req.param('evidenceId'));
    console.log(`DELETE /api/donation-batch/${id}/evidence/${evidenceId}`);

    const batch = await findBatch(db, id);
    // Removing proof from a published batch would leave the public page
    // asserting a payout it can no longer evidence. Unpublish first.
    assertUnpublished(batch);

    const [row] = await db
      .select()
      .from(donationBatchEvidenceTable)
      .where(
        and(
          eq(donationBatchEvidenceTable.id, evidenceId),
          // Scoped to the batch in the path, so a mismatched pair is a 404
          // rather than deleting someone else's evidence by id alone.
          eq(donationBatchEvidenceTable.batchId, id)
        )
      );
    if (row === undefined)
      throw new NotFoundError(`evidence ${evidenceId} not found on donation batch ${id}`);

    // Row first, object second. If S3 refuses, the order makes no
    // difference -- the whole handler rolls back and both survive either
    // way. It matters in the other failure: with the object deleted
    // first, a row delete that then fails (a lock timeout, a deadlock)
    // rolls back and leaves a row pointing at nothing. This order cannot
    // produce that pair. No test distinguishes the two, because forcing
    // the row delete to fail needs a database fault, not a mock.
    await db.delete(donationBatchEvidenceTable).where(eq(donationBatchEvidenceTable.id, row.id));
    await deleteFromS3(row.s3Key);

    return c.body(null, 204);
  })
  /**
   * Makes one batch visible on the public page. The guards live here.
   *
   * `/api/info/donation` deliberately reports platformTopUp with its sign
   * instead of clamping it at zero, on the grounds that an underpaid batch
   * should never have been published in the first place. This is the place
   * that has to be true.
   */
  .put('/:id/publish', async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`PUT /api/donation-batch/${id}/publish`);

    const batch = await findBatch(db, id);
    if (batch.published)
      throw new BadRequestError(
        `donation batch ${id} is already published`,
        'BATCH_ALREADY_PUBLISHED'
      );

    const totals = await memberTotals(db, id);
    // Less money left the bank than was promised. Publishing this would
    // print a negative platform top-up on a page whose only purpose is
    // being checkable.
    if (batch.transferredAmount < totals.subtotal)
      throw new BadRequestError(
        `transferred ${batch.transferredAmount} is less than the donations' subtotal ${totals.subtotal}`,
        'BATCH_UNDERPAID'
      );

    const [{ evidenceCount }] = await db
      .select({ evidenceCount: count() })
      .from(donationBatchEvidenceTable)
      .where(eq(donationBatchEvidenceTable.batchId, id));
    // A transparency page with nothing to show is just a claim. The whole
    // feature is the evidence.
    if (evidenceCount === 0)
      throw new BadRequestError(
        `donation batch ${id} has no evidence attached`,
        'BATCH_NO_EVIDENCE'
      );

    const now = new Date();
    await db
      .update(donationBatchTable)
      .set({ published: true, updatedAt: now })
      .where(eq(donationBatchTable.id, id));

    const updated = await findBatch(db, id);
    const [organization] = await db
      .select({ id: charityOrganizationTable.id, name: charityOrganizationTable.name })
      .from(charityOrganizationTable)
      .where(eq(charityOrganizationTable.id, updated.organizationId));
    const evidence = await evidenceByBatch(db, [id]);

    return c.json(buildBatchDto(updated, organization ?? null, totals, evidence.get(id) ?? []));
  })
  /** The way back out of a mis-click. The public page lists published only. */
  .put('/:id/unpublish', async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`PUT /api/donation-batch/${id}/unpublish`);

    const batch = await findBatch(db, id);
    if (!batch.published)
      throw new BadRequestError(`donation batch ${id} is not published`, 'BATCH_NOT_PUBLISHED');

    const now = new Date();
    await db
      .update(donationBatchTable)
      .set({ published: false, updatedAt: now })
      .where(eq(donationBatchTable.id, id));

    const updated = await findBatch(db, id);
    const totals = await memberTotals(db, id);
    const [organization] = await db
      .select({ id: charityOrganizationTable.id, name: charityOrganizationTable.name })
      .from(charityOrganizationTable)
      .where(eq(charityOrganizationTable.id, updated.organizationId));
    const evidence = await evidenceByBatch(db, [id]);

    return c.json(buildBatchDto(updated, organization ?? null, totals, evidence.get(id) ?? []));
  })
  /**
   * Discards an unpublished batch and releases its donations.
   *
   * This is the only way to correct a wrong membership list, so it has to
   * put every member back to batchId NULL -- a donation left pointing at a
   * deleted batch would read as paid forever, and the FK would refuse the
   * delete anyway.
   */
  .delete('/:id', async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`DELETE /api/donation-batch/${id}`);

    const batch = await findBatch(db, id);
    assertUnpublished(batch);

    const evidence = await db
      .select({ id: donationBatchEvidenceTable.id, s3Key: donationBatchEvidenceTable.s3Key })
      .from(donationBatchEvidenceTable)
      .where(eq(donationBatchEvidenceTable.batchId, id));

    const now = new Date();
    await db
      .update(donationTable)
      .set({ batchId: null, updatedAt: now })
      .where(eq(donationTable.batchId, id));
    await db
      .delete(donationBatchEvidenceTable)
      .where(eq(donationBatchEvidenceTable.batchId, id));
    await db.delete(donationBatchTable).where(eq(donationBatchTable.id, id));

    // After the rows, same ordering as the single-evidence delete above.
    // An S3 failure part-way through rolls every row back, so the batch
    // survives with some of its objects gone -- recoverable, because the
    // rows still carry the keys and a retry re-runs the whole delete.
    for (const row of evidence) await deleteFromS3(row.s3Key);

    return c.body(null, 204);
  });
