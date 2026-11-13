import 'zod-openapi/extend';
import { zValidator } from '@hono/zod-validator';
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import {
  categoryTable,
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
  maxedSpiritCount: z
    .number()
    .int()
    .describe('Spirits grown to max level -- every one of them is owed'),
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
    // "57 x NT$1,000 = NT$57,000", which is only true while every member
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
    // spirits that have maxed and not chosen yet are invisible to that
    // table -- and they are already owed.
    //
    // The two halves are counted differently on purpose. What has been
    // chosen is summed from the frozen amounts, so a later change to
    // DONATION_AMOUNT cannot rewrite it. What has not been chosen has no
    // frozen amount to read, so it is priced at today's figure, which is
    // the one part of this page that moves if that number moves.
    const [{ maxedSpiritCount }] = await db
      .select({ maxedSpiritCount: count() })
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
    const pendingCount = Math.max(0, maxedSpiritCount - confirmed.confirmedCount);
    const confirmedAmount = confirmed.confirmedAmount;
    const pendingAmount = pendingCount * DONATION_AMOUNT;

    // Every field below is described once, in the schemas above, which
    // is where the generated document reads them from; repeating those
    // sentences here would only give them somewhere to drift.
    return c.json({
      summary: {
        maxedSpiritCount,
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
