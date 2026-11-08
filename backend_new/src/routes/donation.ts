import { zValidator } from '@hono/zod-validator';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
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
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT } from 'src/lib/paginator';
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

const toDto = (row: DonationRow) => ({
  id: row.id,
  userGuardianId: row.userGuardianId,
  amount: row.amount,
  confirmedAt: row.confirmedAt,
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
  batch:
    row.batchId === null
      ? null
      : {
          id: row.batchId,
          transferredAt: row.batchTransferredAt,
          // Whether the public page shows this batch yet. A confirmed
          // donation can be paid before the evidence is uploaded, and the
          // user's own page should not link to a batch nobody can read.
          published: row.batchPublished,
        },
});

export const donation = new Hono<UserEnv>()
  /**
   * The caller's own donations. Includes userGuardianId so the client can
   * tell which of its maxed spirits have already chosen -- the two lists
   * (/api/guardian and this one) are what the picker is built from.
   */
  .get('/', zValidator('query', donationListQuerySchema), async (c) => {
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
    });
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
  .post('/', zValidator('json', donationBodySchema), async (c) => {
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

    return c.json(toDto(saved), 201);
  });
