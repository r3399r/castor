import 'zod-openapi/extend';
import { zValidator } from '@hono/zod-validator';
import { and, asc, count, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import {
  categoryTable,
  charityCategoryTable,
  charityOrganizationCategoryTable,
  charityOrganizationTable,
  donationBatchEvidenceTable,
  donationBatchTable,
  donationTable,
  examTable,
  questionExamTable,
  questionTable,
  subjectTable,
  userGuardianTable,
  userTable,
} from 'src/db/schema';
import { DONATION_AMOUNT } from 'src/lib/donationAmount';
import { MAX_LEVEL, SUBSCRIBER_XP_BONUS_PERCENT } from 'src/lib/guardianLevel';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT, paginationSchema } from 'src/lib/paginator';
import { PLANS } from 'src/lib/subscriptionPlan';
import { TransactionEnv } from 'src/middleware/transaction';

// Sized for the landing page's card grid (three across on a wide screen,
// five rows inside a card) rather than exposed as query parameters: the
// endpoint exists to fill that one section, and a caller who could ask
// for a hundred subjects would be asking this to scan the whole catalog.
const POPULAR_SUBJECT_LIMIT = 3;
const POPULAR_EXAM_LIMIT = 5;

export const donationRecordQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

/**
 * What this API reports, one schema per response.
 *
 * Schemas rather than hand-written types, because they are the single
 * description of each response: the handler's return is checked against
 * one, and the OpenAPI document is generated from it. A type beside a
 * separately written document is two things that drift -- which is
 * exactly what packages/shared turned out to be.
 *
 * `.describe()` is not a comment: it reaches the generated document, and
 * so reaches whoever writes a client against it.
 */
export const getInfoResponseSchema = z.object({
  status: z.literal('ok'),
  time: z.string().describe('When this instance answered, ISO 8601'),
});

const recurringPlanSchema = z.object({
  kind: z.literal('recurring'),
  code: z.string(),
  amount: z
    .number()
    .int()
    .describe('NTD. The authoritative price: a client must render this, never a constant of its own'),
  periodType: z.enum(['D', 'M', 'Y']),
  frequency: z.number().int().describe('Charged once every `frequency` periodType, indefinitely'),
}).openapi({ ref: 'RecurringPlanInfo' });

const dayPassPlanSchema = z.object({
  kind: z.literal('dayPass'),
  code: z.string(),
  amount: z.number().int().describe('NTD, charged once'),
  days: z.number().int().describe('Days of access, added to whatever the caller already has'),
}).openapi({ ref: 'DayPassPlanInfo' });

/**
 * Discriminated on `kind` rather than one shape with optional fields:
 * the two answer different questions, and no periodType honestly
 * describes a day pass -- 'D' with frequency 30 reads as "charged every
 * 30 days", which is exactly what it is not.
 */
export const getInfoPlansResponseSchema = z.array(
  z.discriminatedUnion('kind', [recurringPlanSchema, dayPassPlanSchema])
);

/**
 * The subscriber growth bonus rate.
 *
 * Published for the same reason the prices are: the box screen states the
 * XP an investment will earn *before* the user confirms it, and the server
 * decides what is actually granted. Two copies of the rate meant two
 * numbers that nothing kept equal, and the user sees both.
 *
 * A whole percentage rather than a 0.1 multiplier, and that is not
 * cosmetic: `points * 0.1` is not always what it looks like, because 0.1
 * has no exact binary form. `3 * 0.1` is 0.30000000000000004 and the error
 * has no fixed sign, so a value that should land exactly on an integer can
 * come out just under it and lose a whole XP to the floor below.
 * `(points * 10) / 100` keeps every step on integers until the single
 * division, which IEEE-754 rounds correctly.
 */
export const getInfoGrowthResponseSchema = z
  .object({
    subscriberXpBonusPercent: z
      .number()
      .int()
      .describe(
        'Added to an investment made with paid access, floored: at 10, 100 points earn 110 XP and 5 points earn 5. Whether a given caller earns it is not here -- the server reads entitlement for itself on every invest.'
      ),
  })
  .openapi({ ref: 'GrowthInfo' });

export const getInfoStatsResponseSchema = z.object({
  categoryCount: z.number().int(),
  subjectCount: z.number().int(),
  examCount: z.number().int(),
  questionCount: z
    .number()
    .int()
    .describe('Servable top-level questions: a 題組 counts once, however many sub-questions it holds'),
  userCount: z.number().int(),
});

const popularExamSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  attemptCount: z
    .number()
    .int()
    .describe('How many times the questions were practised -- a 題組 answered once counts once'),
  questionCount: z.number().int().describe('Servable top-level questions, counted as in /stats'),
}).openapi({ ref: 'PopularExam' });

const popularSubjectSchema = popularExamSchema.extend({
  exams: z
    .array(popularExamSchema)
    .describe('Ranked like the subjects themselves, and empty when none of them is filed under an exam'),
}).openapi({ ref: 'PopularSubject' });

export const getInfoPopularResponseSchema = z.array(popularSubjectSchema);

const donationEvidenceSchema = z.object({
  id: z.number().int(),
  kind: z.string().describe('TRANSFER_RECEIPT, ORG_RECEIPT, THANK_YOU_LETTER -- open-ended'),
  url: z.string(),
  caption: z.string().nullable(),
}).openapi({ ref: 'DonationEvidence' });

const donationRecordOrganizationSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  introduction: z.string(),
  websiteUrl: z.string().nullable(),
  logoUrl: z.string().nullable(),
});

const donationRecordBatchSchema = z.object({
  id: z.number().int(),
  transferredAt: z.string().describe('ISO 8601'),
  reference: z
    .string()
    .nullable()
    .describe('Bank transaction number, or the last digits of the account'),
  organization: donationRecordOrganizationSchema,
  donationCount: z.number().int(),
  donationSubtotal: z.number().int(),
  donationUnitAmount: z
    .number()
    .int()
    .nullable()
    .describe('The one frozen amount every member shares, or null when they differ; null means the multiplication must not be printed'),
  platformTopUp: z
    .number()
    .int()
    .describe('transferredAmount - donationSubtotal. Signed: negative would mean the batch sent less than was promised'),
  transferredAmount: z.number().int(),
  evidence: z.array(donationEvidenceSchema),
}).openapi({ ref: 'DonationRecordBatch' });

const donationRecordSummarySchema = z.object({
  maxedGuardianCount: z
    .number()
    .int()
    .describe('Guardians grown to max level -- every one of them is owed'),
  confirmedCount: z.number().int(),
  confirmedAmount: z.number().int().describe('Summed from the frozen per-donation amounts'),
  pendingCount: z
    .number()
    .int()
    .describe('Maxed, but the owner has not picked an organisation yet'),
  pendingAmount: z
    .number()
    .int()
    .describe("pendingCount x donationAmount -- the only figure here priced at today's rate"),
  promisedAmount: z
    .number()
    .int()
    .describe('confirmedAmount + pendingAmount, so a reader can check it'),
  transferredAmount: z
    .number()
    .int()
    .describe('Over published batches only, so the listed batches add up to it'),
  publishedBatchCount: z.number().int(),
  donationAmount: z
    .number()
    .int()
    .describe("Today's figure, which prices pendingAmount and nothing else"),
}).openapi({ ref: 'DonationRecordSummary' });

export const getInfoDonationResponseSchema = z.object({
  summary: donationRecordSummarySchema,
  data: z.array(donationRecordBatchSchema),
  paginate: paginationSchema,
});

/**
 * The roster of organisations behind the payout list.
 *
 * `/donation` answers "where did the money go", one batch at a time. It
 * cannot answer "who can be supported at all", and the two are not the
 * same list: an organisation nobody has chosen yet has no batch, so it is
 * invisible there while being exactly what a reader deciding whether to
 * trust this page wants to see -- and what a user about to grow a guardian
 * to LV5 is choosing from.
 *
 * One row per organisation, each carrying its categories, rather than
 * categories each carrying their organisations. An organisation may be
 * filed under two categories, so the nested shape would print it twice
 * and nothing summed from the rendered cards would be checkable. Flat,
 * **the amounts add up**: every published batch belongs to exactly one
 * organisation and every such organisation is listed here, so summing
 * `receivedAmount` over this list gives /donation's
 * `summary.transferredAmount` exactly. The page says so, which is only
 * honest while this stays one row per organisation.
 *
 * The `taxId` is deliberately not here, matching the organisation block
 * on /donation: the public record names the recipient, it does not
 * publish its paperwork.
 */
const charityRosterCategorySchema = z.object({
  id: z.number().int(),
  code: z.string(),
  name: z.string(),
}).openapi({ ref: 'CharityRosterCategory' });

const charityRosterOrganizationSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  introduction: z.string(),
  websiteUrl: z.string().nullable(),
  logoUrl: z.string().nullable(),
  isActive: z
    .boolean()
    .describe(
      'false is a withdrawn organisation, listed only because it has already been paid: it is out of the chooser but stays part of the record'
    ),
  categories: z
    .array(charityRosterCategorySchema)
    .describe(
      'Ordered by the category sortOrder, then id. Never empty. Includes a category that is itself out of circulation -- it is what routed the money there'
    ),
  receivedAmount: z
    .number()
    .int()
    .describe(
      'Summed over published batches only, so this list adds up to /donation summary.transferredAmount. It is what left the bank account, platform top-up included'
    ),
  batchCount: z
    .number()
    .int()
    .describe('Published batches naming it; 0 for one nobody has chosen yet'),
}).openapi({ ref: 'CharityRosterOrganization' });

/**
 * Unpaginated, unlike every other list in this API.
 *
 * The table is curated by hand -- there is no sign-up flow and never will
 * be -- so this is tens of rows, and the page renders all of them: a
 * roster whose point is completeness cannot sit behind a "next page".
 */
export const getInfoCharityOrganizationResponseSchema = z.array(charityRosterOrganizationSchema);

// mysql2 hands back a bare SUM() over an INT column as a *string*, which
// would survive JSON.stringify and reach the page as "57000". Every
// aggregate below is therefore cast to signed in SQL, the same way
// /popular's attempt counter is; a new one added here needs the same cast
// or it will quietly start returning text.

/**
 * The OpenAPI entries for the routes below.
 *
 * Hoisted out of the route definitions so the handlers keep their own
 * indentation and each route line stays one line; `describeRoute` is
 * middleware, so where it is constructed makes no difference.
 *
 * Requests are not described here. The query parameters of /donation are
 * validated by `@hono/zod-validator`, which hono-openapi cannot read --
 * documenting them means moving all 65 validator call sites in this
 * workspace onto hono-openapi's own `validator`, which also changes the
 * 400 body. See AGENTS.md.
 */
const healthDoc = describeRoute({
  summary: 'Health check',
  description:
    'Touches no table, so it keeps answering 200 while the database is unreachable. This is what the load balancer reads.',
  tags: ['info'],
  responses: {
    200: {
      description: 'The instance is up',
      content: { 'application/json': { schema: resolver(getInfoResponseSchema) } },
    },
  },
});

const plansDoc = describeRoute({
  summary: 'List the subscription plans and their prices',
  description:
    'Public and unauthenticated, because the pricing page is read before signing in. These are the authoritative amounts: the figure shown has to be the figure signed into the ECPay order, so a client must not hold prices of its own.',
  tags: ['info'],
  responses: {
    200: {
      description: 'Every plan on sale',
      content: { 'application/json': { schema: resolver(getInfoPlansResponseSchema) } },
    },
  },
});

const growthDoc = describeRoute({
  summary: 'The subscriber growth bonus rate',
  description:
    'Public and unauthenticated: it is a published benefit of subscribing, read by the box screen before an investment is confirmed, and it says nothing about the caller. The rate is the whole of it -- whether a particular user earns the bonus is decided by the server on each invest, from its own entitlement lookup, never from what a client sends.',
  tags: ['info'],
  responses: {
    200: {
      description: 'The rate, as a whole percentage',
      content: { 'application/json': { schema: resolver(getInfoGrowthResponseSchema) } },
    },
  },
});

const donationDoc = describeRoute({
  summary: 'The public donation record',
  description:
    'Every published payout, with the arithmetic a reader needs to check it against the receipt linked from its evidence: donationCount x donationUnitAmount + platformTopUp equals transferredAmount. Public and unauthenticated on purpose -- being readable by anyone is the whole of its value as proof. It names no user; a batch is the smallest unit shown.',
  tags: ['info'],
  responses: {
    200: {
      description: 'The running totals, and one page of published batches',
      content: { 'application/json': { schema: resolver(getInfoDonationResponseSchema) } },
    },
    400: { description: 'limit beyond the cap, or a malformed offset or order' },
  },
});

const charityDoc = describeRoute({
  summary: 'The public roster of charity organisations',
  description:
    "Every organisation a LV5 contribution can be directed to, with what it has already received. Public and unauthenticated, like the payout list it accompanies. One row per organisation, each with its categories, so `receivedAmount` summed over the list equals /api/info/donation's `summary.transferredAmount`. A withdrawn organisation appears only once it has been paid (`isActive: false`); one nobody has chosen appears with `receivedAmount: 0`. No `taxId`, matching the organisation block on /donation. Unpaginated: the table is hand-curated and this roster is only worth anything complete.",
  tags: ['info'],
  responses: {
    200: {
      description: 'The roster, offered organisations first, then withdrawn ones',
      content: {
        'application/json': { schema: resolver(getInfoCharityOrganizationResponseSchema) },
      },
    },
  },
});

const statsDoc = describeRoute({
  summary: 'Catalog sizes',
  description:
    "The landing page's counter bar. Public and unauthenticated: it reports catalog totals and nothing per-user.",
  tags: ['info'],
  responses: {
    200: {
      description: 'How much there is to practise',
      content: { 'application/json': { schema: resolver(getInfoStatsResponseSchema) } },
    },
  },
});

const popularDoc = describeRoute({
  summary: 'The most-practised subjects, with their most-practised exams',
  description:
    'At most three subjects, each with at most five exams. Public and unauthenticated, and it reports only catalog-wide totals -- never who did the practising.',
  tags: ['info'],
  responses: {
    200: {
      description: 'The ranked subjects, newest counts first',
      content: { 'application/json': { schema: resolver(getInfoPopularResponseSchema) } },
    },
  },
});

export const info = new Hono<TransactionEnv>()
  // Deliberately touches no table: this is the health check, and it has to
  // keep answering 200 while the database is unreachable. The transaction
  // middleware is therefore bound to /api/info/stats alone in app.ts, not
  // to /api/info/*, which would also catch this path.
  .get('/', healthDoc, (c) =>
    c.json({
      status: 'ok',
      time: new Date().toISOString(),
    } satisfies z.infer<typeof getInfoResponseSchema>)
  )
  // The authoritative prices, and the reason the webapp holds no price
  // constants of its own: the amount shown on the pricing page has to be
  // the amount that gets signed into the ECPay order, and a visitor sees
  // that page before signing in -- so this lives here, in the public
  // group, rather than under /api/subscription where requireUser would
  // hide it from exactly the people deciding whether to pay.
  //
  // No database access, so it stays outside the transaction middleware
  // bound to /api/info/stats.
  .get('/plans', plansDoc, (c) => {
    console.log('GET /api/info/plans');

    return c.json(
      // Discriminated on `kind`, because the two shapes answer different
      // questions and collapsing them would invite the client to guess.
      // A recurring plan is "charged every N periods, indefinitely"; a day
      // pass is "N days, once". There is no periodType that honestly
      // describes a day pass -- 'D' with frequency 30 would read as
      // "charged every 30 days", which is exactly what it is not.
      PLANS.map((plan) =>
        plan.kind === 'recurring'
          ? {
              kind: 'recurring' as const,
              code: plan.code,
              amount: plan.amount,
              periodType: plan.periodType,
              frequency: plan.frequency,
            }
          : {
              kind: 'dayPass' as const,
              code: plan.code,
              amount: plan.amount,
              days: plan.days,
            }
      ) satisfies z.infer<typeof getInfoPlansResponseSchema>
    );
  })
  // The one rate, and the reason the webapp holds no copy of it: the box
  // screen shows what an investment will earn before it is made, and this
  // server grants it afterwards. When those two disagree the user is the
  // one who notices.
  //
  // In the public group rather than under /api/subscription, like the
  // prices above, because it is read while deciding whether to subscribe.
  // No database access, so it stays outside the transaction middleware
  // bound to /api/info/stats.
  .get('/growth', growthDoc, (c) => {
    console.log('GET /api/info/growth');

    return c.json({
      subscriberXpBonusPercent: SUBSCRIBER_XP_BONUS_PERCENT,
    } satisfies z.infer<typeof getInfoGrowthResponseSchema>);
  })
  /**
   * The public donation record: every published payout, with the
   * arithmetic a reader needs to check it against the receipt it links to.
   *
   * Public and unauthenticated on purpose -- being readable by anyone,
   * including someone who has never signed in, is the whole of its value
   * as proof. It names no user; a batch is the smallest unit shown.
   *
   * Published batches only. An unpublished one is a payout whose evidence
   * is not attached yet, and the summary's transferredAmount is taken over
   * the same filter so that adding up the listed batches reproduces it.
   */
  .get('/donation', donationDoc, zValidator('query', donationRecordQuerySchema), async (c) => {
    const { limit, offset, order } = c.req.valid('query');
    console.log(`GET /api/info/donation limit=${limit} offset=${offset} order=${order}`);
    const db = c.get('db');

    const isPublished = eq(donationBatchTable.published, true);

    const [{ total }] = await db
      .select({ total: count() })
      .from(donationBatchTable)
      .where(isPublished);

    const batches = await db
      .select({
        id: donationBatchTable.id,
        transferredAmount: donationBatchTable.transferredAmount,
        transferredAt: donationBatchTable.transferredAt,
        reference: donationBatchTable.reference,
        organizationId: charityOrganizationTable.id,
        organizationName: charityOrganizationTable.name,
        organizationIntroduction: charityOrganizationTable.introduction,
        organizationWebsiteUrl: charityOrganizationTable.websiteUrl,
        organizationLogoUrl: charityOrganizationTable.logoUrl,
      })
      .from(donationBatchTable)
      .innerJoin(
        charityOrganizationTable,
        eq(charityOrganizationTable.id, donationBatchTable.organizationId)
      )
      .where(isPublished)
      // id as the tiebreaker: several batches transferred on the same day
      // is the normal case, and without it a paginated list can repeat or
      // skip rows between pages.
      .orderBy(
        order === 'asc'
          ? asc(donationBatchTable.transferredAt)
          : desc(donationBatchTable.transferredAt),
        order === 'asc' ? asc(donationBatchTable.id) : desc(donationBatchTable.id)
      )
      .limit(limit)
      .offset(offset);

    const batchIds = batches.map((batch) => batch.id);

    // Members of the batches on this page, aggregated rather than stored:
    // membership is frozen once a batch exists, so a cached count and
    // subtotal on donation_batch would only be two columns that can
    // disagree with the rows.
    //
    // distinctAmounts exists because the page's headline arithmetic is
    // "57 x NT$100 = NT$5,700", which is only true while every member
    // carries the same frozen amount. One distinct value means that line
    // can be printed; more than one means it has to show the subtotal
    // alone, so the answer is computed here instead of being assumed.
    const members =
      batchIds.length === 0
        ? []
        : await db
            .select({
              batchId: donationTable.batchId,
              donationCount: count(),
              subtotal: sql<number>`cast(coalesce(sum(${donationTable.amount}), 0) as signed)`,
              distinctAmounts: sql<number>`count(distinct ${donationTable.amount})`,
              unitAmount: sql<number>`cast(min(${donationTable.amount}) as signed)`,
            })
            .from(donationTable)
            .where(inArray(donationTable.batchId, batchIds))
            .groupBy(donationTable.batchId);

    const memberById = new Map(members.map((row) => [row.batchId, row]));

    const evidence =
      batchIds.length === 0
        ? []
        : await db
            .select({
              id: donationBatchEvidenceTable.id,
              batchId: donationBatchEvidenceTable.batchId,
              kind: donationBatchEvidenceTable.kind,
              url: donationBatchEvidenceTable.url,
              caption: donationBatchEvidenceTable.caption,
            })
            .from(donationBatchEvidenceTable)
            .where(inArray(donationBatchEvidenceTable.batchId, batchIds))
            .orderBy(
              asc(donationBatchEvidenceTable.sortOrder),
              asc(donationBatchEvidenceTable.id)
            );

    const evidenceByBatchId = new Map<number, typeof evidence>();
    for (const row of evidence) {
      const list = evidenceByBatchId.get(row.batchId) ?? [];
      list.push(row);
      evidenceByBatchId.set(row.batchId, list);
    }

    // How much has been promised in total. Not SUM(donation.amount): a
    // donation row appears only when its owner picks an organisation, so
    // guardians that have maxed and not chosen yet are invisible to that
    // table -- and they are already owed.
    //
    // The two halves are counted differently on purpose. What has been
    // chosen is summed from the frozen amounts, so a later change to
    // DONATION_AMOUNT cannot rewrite it. What has not been chosen has no
    // frozen amount to read, so it is priced at today's figure, which is
    // the one part of this page that moves if that number moves.
    const [{ maxedGuardianCount }] = await db
      .select({ maxedGuardianCount: count() })
      .from(userGuardianTable)
      .where(eq(userGuardianTable.level, MAX_LEVEL));

    const [confirmed] = await db
      .select({
        confirmedCount: count(),
        confirmedAmount: sql<number>`cast(coalesce(sum(${donationTable.amount}), 0) as signed)`,
      })
      .from(donationTable);

    const [transferred] = await db
      .select({
        transferredAmount: sql<number>`cast(coalesce(sum(${donationBatchTable.transferredAmount}), 0) as signed)`,
      })
      .from(donationBatchTable)
      .where(isPublished);

    // Clamped at zero rather than trusted to be non-negative: every
    // donation is confirmed through a max-level guard, so this cannot go
    // negative today, but a negative count would silently reduce the
    // promised total below what has already been paid out.
    const pendingCount = Math.max(0, maxedGuardianCount - confirmed.confirmedCount);
    const confirmedAmount = confirmed.confirmedAmount;
    const pendingAmount = pendingCount * DONATION_AMOUNT;

    // Every field below is described once, in the schemas above, which
    // is where the generated document reads them from; repeating those
    // sentences here would only give them somewhere to drift.
    return c.json({
      summary: {
        maxedGuardianCount,
        confirmedCount: confirmed.confirmedCount,
        confirmedAmount,
        pendingCount,
        pendingAmount,
        promisedAmount: confirmedAmount + pendingAmount,
        transferredAmount: transferred.transferredAmount,
        publishedBatchCount: total,
        donationAmount: DONATION_AMOUNT,
      },
      data: batches.map((batch) => {
        const member = memberById.get(batch.id);
        // ?? 0, not a cast: a batch with no members has no row here at
        // all, which is a missing row rather than a SUM of nothing.
        const donationSubtotal = member?.subtotal ?? 0;
        return {
          id: batch.id,
          // Serialised here rather than left to c.json: the column is a
          // Date, every type in the repo calls this field a string, and
          // JSON.stringify happening to agree is not a contract.
          transferredAt: batch.transferredAt.toISOString(),
          reference: batch.reference,
          organization: {
            id: batch.organizationId,
            name: batch.organizationName,
            introduction: batch.organizationIntroduction,
            websiteUrl: batch.organizationWebsiteUrl,
            logoUrl: batch.organizationLogoUrl,
          },
          donationCount: Number(member?.donationCount ?? 0),
          donationSubtotal,
          // The one frozen amount every member shares, or null when they
          // differ -- see distinctAmounts above. null means the page must
          // not print a multiplication.
          donationUnitAmount:
            Number(member?.distinctAmounts ?? 0) === 1 ? Number(member?.unitAmount) : null,
          // Signed, deliberately not clamped at zero. A batch that sent
          // less than was promised must never have been published -- that
          // is the admin UI's job -- but if one ever is, clamping would
          // break the only arithmetic this page exists for: count x unit
          // + topUp has to equal what the receipt says.
          platformTopUp: batch.transferredAmount - donationSubtotal,
          transferredAmount: batch.transferredAmount,
          evidence: (evidenceByBatchId.get(batch.id) ?? []).map((row) => ({
            id: row.id,
            kind: row.kind,
            url: row.url,
            caption: row.caption,
          })),
        };
      }),
      paginate: genPagination(total, limit, offset),
    } satisfies z.infer<typeof getInfoDonationResponseSchema>);
  })
  /**
   * Who the money can go to, beside the record of where it went.
   *
   * The public view of `charity_organization`, the way /donation is the
   * public view of `donation_batch`. `GET /api/charity-organization`
   * already reads without credentials and would have served this, but it
   * sits under the /api/* behavior, which forwards Authorization and
   * caches nothing; mounted here it takes the 5-minute TTL in front of
   * /api/info/*, which is where the one page that may actually get a
   * traffic spike is served from. It also carries two figures that list
   * has no business computing for an admin filtering by category -- the
   * received total and the batch count, which need an aggregate join.
   */
  .get('/charity-organization', charityDoc, async (c) => {
    console.log('GET /api/info/charity-organization');
    const db = c.get('db');

    // Published only, and the same condition /donation's summary uses --
    // that is what makes the two sections' numbers the same numbers. An
    // unpublished batch has no evidence attached yet and may still be
    // wrong; counting it here would announce a payout nobody can check.
    const payouts = await db
      .select({
        organizationId: donationBatchTable.organizationId,
        batchCount: count(),
        receivedAmount: sql<number>`cast(coalesce(sum(${donationBatchTable.transferredAmount}), 0) as signed)`,
      })
      .from(donationBatchTable)
      .where(eq(donationBatchTable.published, true))
      .groupBy(donationBatchTable.organizationId);

    const payoutByOrganizationId = new Map(payouts.map((row) => [row.organizationId, row]));
    const paidIds = payouts.map((row) => row.organizationId);

    // Active, *or* already paid. The second half is not a nicety: a
    // foundation that folds is switched to is_active = 0 rather than
    // deleted, precisely so the batches naming it keep rendering -- and
    // dropping it from this list would break the sum the page prints,
    // leaving money in the total that belongs to nobody on the list.
    const rows = await db
      .select({
        id: charityOrganizationTable.id,
        name: charityOrganizationTable.name,
        introduction: charityOrganizationTable.introduction,
        websiteUrl: charityOrganizationTable.websiteUrl,
        logoUrl: charityOrganizationTable.logoUrl,
        isActive: charityOrganizationTable.isActive,
      })
      .from(charityOrganizationTable)
      .where(
        // No `IN ()` when nothing has been paid out yet: it is not valid
        // SQL.
        paidIds.length === 0
          ? eq(charityOrganizationTable.isActive, true)
          : or(
              eq(charityOrganizationTable.isActive, true),
              inArray(charityOrganizationTable.id, paidIds)
            )
      )
      // Offered first, then the curated order, then id. isActive descends
      // because a withdrawn organisation is a footnote on this page, not
      // something to lead with; id breaks the tie because sortOrder
      // defaults to 0 for every row, so without it the order is whatever
      // MySQL happens to return and the list reshuffles between loads.
      .orderBy(
        desc(charityOrganizationTable.isActive),
        asc(charityOrganizationTable.sortOrder),
        asc(charityOrganizationTable.id)
      );

    const organizationIds = rows.map((row) => row.id);

    // Every linked category, including an inactive one: it is out of the
    // chooser, but it is still what this organisation is offered under,
    // and a card with no label at all is worse than a label for a
    // category nobody can pick today.
    const links =
      organizationIds.length === 0
        ? []
        : await db
            .select({
              organizationId: charityOrganizationCategoryTable.organizationId,
              id: charityCategoryTable.id,
              code: charityCategoryTable.code,
              name: charityCategoryTable.name,
            })
            .from(charityOrganizationCategoryTable)
            .innerJoin(
              charityCategoryTable,
              eq(charityCategoryTable.id, charityOrganizationCategoryTable.categoryId)
            )
            .where(inArray(charityOrganizationCategoryTable.organizationId, organizationIds))
            .orderBy(asc(charityCategoryTable.sortOrder), asc(charityCategoryTable.id));

    const categoriesByOrganizationId = new Map<
      number,
      z.infer<typeof charityRosterCategorySchema>[]
    >();
    for (const link of links) {
      const list = categoriesByOrganizationId.get(link.organizationId) ?? [];
      list.push({ id: link.id, code: link.code, name: link.name });
      categoriesByOrganizationId.set(link.organizationId, list);
    }

    // Field by field, not a spread: charity_organization holds a taxId,
    // and a column added to that table must not reach this page by
    // default. See "Map the row field by field" in AGENTS.md.
    return c.json(
      rows.map((row) => {
        const payout = payoutByOrganizationId.get(row.id);
        return {
          id: row.id,
          name: row.name,
          introduction: row.introduction,
          websiteUrl: row.websiteUrl,
          logoUrl: row.logoUrl,
          isActive: row.isActive,
          categories: categoriesByOrganizationId.get(row.id) ?? [],
          // ?? 0, not a cast: an organisation nothing has been paid for
          // has no row in `payouts` at all, which is a missing row rather
          // than a SUM of nothing.
          receivedAmount: payout?.receivedAmount ?? 0,
          batchCount: Number(payout?.batchCount ?? 0),
        };
      }) satisfies z.infer<typeof getInfoCharityOrganizationResponseSchema>
    );
  })
  // Public and unauthenticated -- it only feeds the landing page's counter
  // bar, so it reports catalog sizes and nothing per-user.
  .get('/stats', statsDoc, async (c) => {
    console.log('GET /api/info/stats');
    const db = c.get('db');

    // Five sequential COUNT(*)s rather than one select of scalar
    // subqueries: they share this request's transaction, so the numbers
    // are still read from one consistent snapshot, and mysql2 can't
    // pipeline concurrent queries on a single connection anyway.
    const [{ total: categoryCount }] = await db
      .select({ total: count() })
      .from(categoryTable);
    const [{ total: subjectCount }] = await db
      .select({ total: count() })
      .from(subjectTable);
    const [{ total: examCount }] = await db
      .select({ total: count() })
      .from(examTable);

    // Same definition of "a question" as GET /api/question/count: the
    // top-level rows that are actually servable. A 題組's children aren't
    // counted separately (the parent is the one question a user is given),
    // and enabled only ever means anything on a top-level row.
    const [{ total: questionCount }] = await db
      .select({ total: count() })
      .from(questionTable)
      .where(and(isNull(questionTable.parentId), eq(questionTable.enabled, true)));

    const [{ total: userCount }] = await db
      .select({ total: count() })
      .from(userTable);

    return c.json({
      categoryCount,
      subjectCount,
      examCount,
      questionCount,
      userCount,
    } satisfies z.infer<typeof getInfoStatsResponseSchema>);
  })
  // The most-attempted subjects, each with its most-attempted exams --
  // public and unauthenticated for the same reason as /stats: it feeds a
  // landing-page section a visitor sees before signing in, and it reports
  // only catalog-wide totals, never who did the attempting.
  //
  // "Attempts" means how many times a question was practised, which is not
  // the same as how many answers it drew. reply.ts increments
  // question.attemp_count on the question that was actually answered, and
  // for a 題組 that is always the child row -- the parent's own counter
  // stays at 0 forever. So every row is first rolled up onto its top-level
  // question and reduced with MAX, not SUM:
  //
  //   - MAX over a standalone question's single row is its own counter.
  //   - MAX over a 題組 is one sub-question's counter, and the frontend
  //     submits every child together (unanswered ones included), so they
  //     all hold the same number: that number is how many times the 題組
  //     was served.
  //
  // SUM would instead multiply a 題組 by its number of sub-questions, which
  // would fill this section with whichever subjects happen to be written as
  // 題組 rather than with the ones people actually practise. MAX also
  // survives a sub-question being added to an existing group later, where
  // SUM would start reporting a number that means nothing in particular.
  //
  // Only enabled top-level questions count. A disabled question's past
  // attempts really did happen, but this section is an invitation to
  // practise, and adaptive selection will not serve them -- so counting
  // them could put a subject at the top of the page that has nothing left
  // to answer.
  .get('/popular', popularDoc, async (c) => {
    console.log('GET /api/info/popular');
    const db = c.get('db');

    const top = alias(questionTable, 'top');
    // One row per servable top-level question, carrying the attempts of
    // the whole question (a 題組 included). Everything below groups these
    // rows, so each question weighs exactly one regardless of how many
    // sub-questions it is made of.
    const perQuestion = db
      .select({
        id: top.id,
        subjectId: top.subjectId,
        attempts: sql<number>`max(${questionTable.attempCount})`.as('attempts'),
      })
      .from(questionTable)
      // Every question row joined to the top-level row that owns it: a
      // standalone question to itself, a sub-question to its parent.
      .innerJoin(top, sql`${top.id} = coalesce(${questionTable.parentId}, ${questionTable.id})`)
      .where(and(isNull(top.parentId), eq(top.enabled, true)))
      .groupBy(top.id, top.subjectId)
      .as('per_question');

    // SUM() over an INT column comes back from MySQL as DECIMAL, which
    // mysql2 hands over as a string; the cast keeps it a number here and
    // the Number() below covers the driver changing its mind.
    const attempts = sql<number>`cast(coalesce(sum(${perQuestion.attempts}), 0) as signed)`;
    const questions = count();

    const subjects = await db
      .select({
        id: subjectTable.id,
        name: subjectTable.name,
        attemptCount: attempts,
        questionCount: questions,
      })
      .from(perQuestion)
      .innerJoin(subjectTable, eq(subjectTable.id, perQuestion.subjectId))
      .groupBy(subjectTable.id, subjectTable.name)
      // The tie-breakers are what make this section usable before anyone
      // has answered anything: with every attemptCount still 0, ordering
      // by attempts alone would hand MySQL a free choice of three
      // subjects, and the page would reshuffle itself between requests.
      .orderBy(
        desc(attempts),
        desc(questions),
        asc(subjectTable.sortOrder),
        asc(subjectTable.id)
      )
      .limit(POPULAR_SUBJECT_LIMIT);

    if (subjects.length === 0) {
      return c.json([] satisfies z.infer<typeof getInfoPopularResponseSchema>);
    }

    // Exams are attributed through the top-level question's own subject
    // rather than through exam_subject: an exam can be linked to several
    // subjects, and what belongs on a subject's card is the attempts its
    // own questions drew, not the exam's total everywhere.
    const examRows = await db
      .select({
        subjectId: perQuestion.subjectId,
        id: examTable.id,
        name: examTable.name,
        attemptCount: attempts,
        questionCount: questions,
      })
      .from(perQuestion)
      // question_exam is only ever populated on the parent of a 題組, so
      // the link is read off the rolled-up top-level row.
      .innerJoin(questionExamTable, eq(questionExamTable.questionId, perQuestion.id))
      .innerJoin(examTable, eq(examTable.id, questionExamTable.examId))
      .where(
        inArray(
          perQuestion.subjectId,
          subjects.map((s) => s.id)
        )
      )
      .groupBy(perQuestion.subjectId, examTable.id, examTable.name)
      .orderBy(desc(attempts), desc(questions), asc(examTable.id));

    // Top-N-per-group in SQL would need a window function for the sake of
    // trimming at most a few hundred rows, so the cut happens here.
    const examsBySubject = new Map<number, typeof examRows>();
    for (const row of examRows) {
      const list = examsBySubject.get(row.subjectId) ?? [];
      if (list.length < POPULAR_EXAM_LIMIT) list.push(row);
      examsBySubject.set(row.subjectId, list);
    }

    return c.json(
      subjects.map((subject) => ({
        id: subject.id,
        name: subject.name,
        attemptCount: Number(subject.attemptCount),
        questionCount: Number(subject.questionCount),
        exams: (examsBySubject.get(subject.id) ?? []).map((exam) => ({
          id: exam.id,
          name: exam.name,
          attemptCount: Number(exam.attemptCount),
          questionCount: Number(exam.questionCount),
        })),
      })) satisfies z.infer<typeof getInfoPopularResponseSchema>
    );
  });
