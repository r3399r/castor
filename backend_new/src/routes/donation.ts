import { zValidator } from '@hono/zod-validator';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import {
  charityCategoryTable,
  charityOrganizationCategoryTable,
  charityOrganizationTable,
  donationBatchTable,
  donationTable,
  guardianTable,
  userGuardianTable,
} from 'src/db/schema';
import { DONATION_AMOUNT } from 'src/lib/donationAmount';
import { MAX_LEVEL } from 'src/lib/guardianLevel';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT, paginationSchema } from 'src/lib/paginator';
import { UserEnv } from 'src/middleware/requireUser';
import { BadRequestError, NotFoundError } from 'src/model/error';

export const donationBodySchema = z.object({
  // The entitlement being spent: one maxed spirit, one donation.
  userGuardianId: z.number().int().positive(),
  organizationId: z.number().int().positive(),
  // The public-interest category. Optional because an ordinary spirit has
  // exactly one legal value (its own species' category), so the client
  // need not repeat it; a species with no category of its own (VIP) must
  // say which one it is choosing.
  categoryId: z.number().int().positive().optional(),
});

export const donationListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

type Db = UserEnv['Variables']['db'];

/**
 * Everything one donation row needs to render, in one query per page.
 *
 * `batch` is null while the money has not gone out yet -- donation.batchId
 * NULL is the whole state machine, there is no status column. Once set,
 * the batch carries the transfer date and whether it has been published,
 * which is what lets the user's own record link to the public proof.
 */
const selectDonations = (db: Db) =>
  db
    .select({
      id: donationTable.id,
      userGuardianId: donationTable.userGuardianId,
      amount: donationTable.amount,
      confirmedAt: donationTable.confirmedAt,
      categoryId: charityCategoryTable.id,
      categoryCode: charityCategoryTable.code,
      categoryName: charityCategoryTable.name,
      organizationId: charityOrganizationTable.id,
      organizationName: charityOrganizationTable.name,
      organizationIntroduction: charityOrganizationTable.introduction,
      organizationWebsiteUrl: charityOrganizationTable.websiteUrl,
      organizationLogoUrl: charityOrganizationTable.logoUrl,
      batchId: donationBatchTable.id,
      batchTransferredAt: donationBatchTable.transferredAt,
      batchPublished: donationBatchTable.published,
    })
    .from(donationTable)
    .innerJoin(charityCategoryTable, eq(charityCategoryTable.id, donationTable.categoryId))
    .innerJoin(
      charityOrganizationTable,
      eq(charityOrganizationTable.id, donationTable.organizationId)
    )
    // Left, not inner: an unpaid donation has no batch and must still be
    // listed -- that is the common case right after confirming.
    .leftJoin(donationBatchTable, eq(donationBatchTable.id, donationTable.batchId));

// The builder is a thenable, so Awaited on its return type resolves to
// the row array -- no need to restate the selected columns by hand.
type DonationRow = Awaited<ReturnType<typeof selectDonations>>[number];


/**
 * One donation as this API reports it to the person who made it.
 *
 * A schema rather than a hand-written type: it is the single description
 * of the response, both handlers' returns are checked against it, and
 * the OpenAPI document is generated from it. See "The OpenAPI document"
 * in AGENTS.md.
 */
export const donationSchema = z.object({
  id: z.number().int(),
  userGuardianId: z
    .number()
    .int()
    .describe('Which maxed spirit paid for it -- how the picker knows one is spent'),
  amount: z
    .number()
    .int()
    .describe('Frozen at confirmation. Never render the current donationAmount in its place'),
  confirmedAt: z.string().describe('ISO 8601'),
  category: z.object({
    id: z.number().int(),
    code: z.string(),
    name: z.string(),
  }),
  organization: z.object({
    id: z.number().int(),
    name: z.string(),
    introduction: z.string(),
    websiteUrl: z.string().nullable(),
    logoUrl: z.string().nullable(),
  }),
  batch: z
    .object({
      id: z.number().int(),
      transferredAt: z.string().describe('ISO 8601'),
      published: z
        .boolean()
        .describe(
          'Whether the public page shows this batch yet. A donation can be paid before its evidence is uploaded, and this record should not link to a batch nobody can read.'
        ),
    })
    .nullable()
    .describe('null while the money has not gone out yet -- there is no status column'),
});

export const getDonationResponseSchema = z.object({
  data: z.array(donationSchema),
  paginate: paginationSchema,
  donationAmount: z
    .number()
    .int()
    .describe(
      'What confirming one more spirit would be worth. The figure a *new* donation would freeze, which is why every row above carries its own amount instead.'
    ),
});

const listDoc = describeRoute({
  summary: "The caller's own donations",
  description:
    'Behind requireUser, and scoped to the caller. Carries `userGuardianId` so the client can tell which of its maxed spirits have already chosen: this list and GET /api/guardian are what the picker is built from.',
  tags: ['donation'],
  responses: {
    200: {
      description: 'One page of donations, newest first by default',
      content: { 'application/json': { schema: resolver(getDonationResponseSchema) } },
    },
    400: { description: 'limit beyond the cap, or a malformed offset or order' },
    401: { description: 'No valid identity' },
  },
});

const createDoc = describeRoute({
  summary: 'Confirm which organisation one maxed spirit supports',
  description:
    'Behind requireUser. Irreversible by design: `donation.user_guardian_id` is UNIQUE, so one spirit means one donation forever. `categoryId` is required only for a species tied to no category (the VIP spirit, whose owner may direct the donation anywhere); for any other spirit the only legal value is its own category, so it can be left out.',
  tags: ['donation'],
  responses: {
    201: {
      description: 'The donation as recorded, awaiting payout',
      content: { 'application/json': { schema: resolver(donationSchema) } },
    },
    400: {
      description:
        'The spirit is not at the maximum level (GUARDIAN_NOT_MAX_LEVEL), it has already chosen (DONATION_ALREADY_CONFIRMED), a category is required (DONATION_CATEGORY_REQUIRED) or not its own (DONATION_CATEGORY_INVALID) or out of circulation (DONATION_CATEGORY_INACTIVE), the organisation is out of circulation (ORGANIZATION_INACTIVE) or is not offered under the chosen category (ORGANIZATION_CATEGORY_MISMATCH) -- the code in the body says which',
    },
    401: { description: 'No valid identity' },
    404: {
      description:
        'No such spirit belongs to this caller, or no such organisation. Someone else\'s spirit reads as not-found rather than forbidden: whether a given id exists is not this caller\'s business',
    },
  },
});

/**
 * Serialises one donation row.
 *
 * The dates are converted here rather than left to `c.json`: the columns
 * are Dates, every type in the repo calls these fields strings, and
 * JSON.stringify happening to agree is not a contract. The bytes on the
 * wire are identical.
 */
const toDto = (row: DonationRow): z.infer<typeof donationSchema> => ({
  id: row.id,
  userGuardianId: row.userGuardianId,
  amount: row.amount,
  confirmedAt: row.confirmedAt.toISOString(),
  category: {
    id: row.categoryId,
    code: row.categoryCode,
    name: row.categoryName,
  },
  organization: {
    id: row.organizationId,
    name: row.organizationName,
    introduction: row.organizationIntroduction,
    websiteUrl: row.organizationWebsiteUrl,
    logoUrl: row.organizationLogoUrl,
  },
  // All three checked together, although batchId alone decides it at
  // runtime: the left join widens every donation_batch column to
  // nullable, NOT NULL ones included, and TypeScript cannot see that a
  // set batchId means the row matched. This is why the response used to
  // be typed `transferredAt: Date | null, published: boolean | null`
  // while packages/shared said `string` and `boolean` -- narrowing here
  // makes the honest type the one the document carries, without a
  // non-null assertion.
  batch:
    row.batchId === null || row.batchTransferredAt === null || row.batchPublished === null
      ? null
      : {
          id: row.batchId,
          transferredAt: row.batchTransferredAt.toISOString(),
          published: row.batchPublished,
        },
});

export const donation = new Hono<UserEnv>()
  /**
   * The caller's own donations. Includes userGuardianId so the client can
   * tell which of its maxed spirits have already chosen -- the two lists
   * (/api/guardian and this one) are what the picker is built from.
   */
  .get('/', listDoc, zValidator('query', donationListQuerySchema), async (c) => {
    const user = c.get('user');
    const { limit, offset, order } = c.req.valid('query');
    console.log(`GET /api/donation userId=${user.id} limit=${limit} offset=${offset} order=${order}`);
    const db = c.get('db');

    const [{ total }] = await db
      .select({ total: count() })
      .from(donationTable)
      .where(eq(donationTable.userId, user.id));

    const rows = await selectDonations(db)
      .where(eq(donationTable.userId, user.id))
      // id as the tiebreaker: several spirits confirmed in one sitting
      // share a confirmedAt to the millisecond often enough that without
      // it a paginated list can repeat or skip rows between pages.
      .orderBy(
        order === 'asc' ? asc(donationTable.confirmedAt) : desc(donationTable.confirmedAt),
        order === 'asc' ? asc(donationTable.id) : desc(donationTable.id)
      )
      .limit(limit)
      .offset(offset);

    return c.json({
      data: rows.map(toDto),
      paginate: genPagination(total, limit, offset),
      // Echoed so the picker can show what confirming is worth without a
      // second endpoint. It is the figure a *new* donation would freeze,
      // which is why each row above carries its own amount instead.
      donationAmount: DONATION_AMOUNT,
    } satisfies z.infer<typeof getDonationResponseSchema>);
  })
  /**
   * Confirm which organisation one maxed spirit supports.
   *
   * Irreversible by design: donation.userGuardianId is UNIQUE, so one
   * spirit means one donation forever. That constraint is the real
   * guarantee here -- the checks below are there to answer with something
   * meaningful instead of a driver error, not to be the only line of
   * defence against a replayed request.
   */
  .post('/', createDoc, zValidator('json', donationBodySchema), async (c) => {
    const user = c.get('user');
    const { userGuardianId, organizationId, categoryId } = c.req.valid('json');
    console.log(
      `POST /api/donation userId=${user.id} userGuardianId=${userGuardianId} organizationId=${organizationId} categoryId=${categoryId ?? ''}`
    );
    const db = c.get('db');

    // The spirit, its species row, and that species' category, in one go.
    // Scoped to the caller's own rows: someone else's spirit must read as
    // "not found", not as "forbidden", since whether a given id exists is
    // not this caller's business.
    const [spirit] = await db
      .select({
        id: userGuardianTable.id,
        level: userGuardianTable.level,
        // null for a species not tied to a category -- the VIP spirit,
        // whose owner may direct the donation anywhere. This replaced an
        // unrestrictedCategory flag: the absence of a category *is* the
        // permission, so there is nothing left to keep in step.
        speciesCategoryId: guardianTable.categoryId,
      })
      .from(userGuardianTable)
      .innerJoin(guardianTable, eq(guardianTable.id, userGuardianTable.guardianId))
      .where(and(eq(userGuardianTable.id, userGuardianId), eq(userGuardianTable.userId, user.id)));
    if (spirit === undefined) throw new NotFoundError(`guardian ${userGuardianId} not found`);

    if (spirit.level < MAX_LEVEL)
      throw new BadRequestError(
        `guardian ${userGuardianId} is level ${spirit.level}, not ${MAX_LEVEL}`,
        'GUARDIAN_NOT_MAX_LEVEL'
      );

    // Checked before the UNIQUE index would, so a double-tapped confirm
    // button gets a named error rather than a 500. The index is still what
    // makes this safe; this is the readable half.
    const [existing] = await db
      .select({ id: donationTable.id })
      .from(donationTable)
      .where(eq(donationTable.userGuardianId, userGuardianId));
    if (existing)
      throw new BadRequestError(
        `guardian ${userGuardianId} has already supported an organization (donation ${existing.id})`,
        'DONATION_ALREADY_CONFIRMED'
      );

    // Which category this donation is filed under. A species with a
    // category of its own has exactly one legal answer, so an omitted
    // categoryId means "its own" and a different one is a mistake worth
    // naming. A species without one (VIP) has every active category to
    // choose from, so it has to say.
    let chosenCategoryId: number;
    if (spirit.speciesCategoryId === null) {
      if (categoryId === undefined)
        throw new BadRequestError(
          'categoryId is required for a guardian that may support any category',
          'DONATION_CATEGORY_REQUIRED'
        );
      const [category] = await db
        .select({ id: charityCategoryTable.id, isActive: charityCategoryTable.isActive })
        .from(charityCategoryTable)
        .where(eq(charityCategoryTable.id, categoryId));
      if (category === undefined) throw new BadRequestError('category does not exist');
      // An inactive category still exists so the public record can name
      // it, but it is out of circulation and takes no new donations.
      if (!category.isActive)
        throw new BadRequestError(
          `category ${categoryId} is not accepting donations`,
          'DONATION_CATEGORY_INACTIVE'
        );
      chosenCategoryId = category.id;
    } else {
      if (categoryId !== undefined && categoryId !== spirit.speciesCategoryId)
        throw new BadRequestError(
          `guardian ${userGuardianId} may only support its own category ${spirit.speciesCategoryId}`,
          'DONATION_CATEGORY_INVALID'
        );
      chosenCategoryId = spirit.speciesCategoryId;
    }

    const [organization] = await db
      .select({ id: charityOrganizationTable.id, isActive: charityOrganizationTable.isActive })
      .from(charityOrganizationTable)
      .where(eq(charityOrganizationTable.id, organizationId));
    if (organization === undefined)
      throw new NotFoundError(`charity organization ${organizationId} not found`);
    // Deactivated organisations stay in the database because past
    // donations point at them, but they are out of circulation and must
    // not collect new ones.
    if (!organization.isActive)
      throw new BadRequestError(
        `charity organization ${organizationId} is not accepting donations`,
        'ORGANIZATION_INACTIVE'
      );

    // The organisation has to actually be offered under the chosen
    // category. Without this the category on the row and the one the user
    // browsed could disagree, and the public page groups by category.
    const [link] = await db
      .select({ organizationId: charityOrganizationCategoryTable.organizationId })
      .from(charityOrganizationCategoryTable)
      .where(
        and(
          eq(charityOrganizationCategoryTable.organizationId, organizationId),
          eq(charityOrganizationCategoryTable.categoryId, chosenCategoryId)
        )
      );
    if (link === undefined)
      throw new BadRequestError(
        `charity organization ${organizationId} is not offered under category ${chosenCategoryId}`,
        'ORGANIZATION_CATEGORY_MISMATCH'
      );

    const now = new Date();
    const [{ insertId }] = await db.insert(donationTable).values({
      userId: user.id,
      userGuardianId,
      categoryId: chosenCategoryId,
      organizationId,
      // Frozen here, deliberately. See DONATION_AMOUNT.
      amount: DONATION_AMOUNT,
      // batchId left NULL: awaiting payout.
      confirmedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const [saved] = await selectDonations(db).where(eq(donationTable.id, insertId));

    return c.json(toDto(saved) satisfies z.infer<typeof donationSchema>, 201);
  });
