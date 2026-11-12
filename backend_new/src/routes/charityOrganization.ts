import { zValidator } from '@hono/zod-validator';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import {
  charityCategoryTable,
  charityOrganizationCategoryTable,
  charityOrganizationTable,
  donationBatchTable,
  donationTable,
} from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT, paginationSchema } from 'src/lib/paginator';
import { TransactionEnv } from 'src/middleware/transaction';
import { BadRequestError, NotFoundError } from 'src/model/error';

type Db = TransactionEnv['Variables']['db'];

// A foundation's name, blurb and website are the things the public
// transparency page exists to show, so reads here are deliberately open
// (the group's adminAuth gates writes only). Nothing on this table is
// private -- unlike /api/question, where open GETs also expose the answer
// key and are tolerated rather than intended.

// Loose on purpose: the admin types these by hand and the repo validates
// no other URL, but a typo here renders a dead 官網 link on the public
// page, which is the one page whose whole job is looking trustworthy.
// Checking the scheme catches "www.example.org" without pretending to
// know what a valid path looks like.
const HTTP_URL = /^https?:\/\/\S+$/;
const urlField = z
  .string()
  .max(500)
  .regex(HTTP_URL, 'must start with http:// or https://')
  .nullish();

export const charityOrganizationBodySchema = z.object({
  name: z.string().min(1).max(100),
  // The 統編. Eight digits, and unique across the table so one foundation
  // cannot be entered twice under two spellings of its name. Nullable
  // because small associations are not always findable.
  taxId: z
    .string()
    .regex(/^\d{8}$/, 'must be 8 digits')
    .nullish(),
  introduction: z.string().min(1),
  websiteUrl: urlField,
  logoUrl: urlField,
  sortOrder: z.number().int().min(0).max(32767).optional().default(0),
  isActive: z.boolean().optional().default(true),
  // At least one: an organisation under no category is offered to nobody,
  // so an empty array is a mistake rather than a meaningful state.
  categoryIds: z.array(z.number().int().positive()).min(1),
});

export const charityOrganizationCategoryBodySchema = z.object({
  categoryIds: z.array(z.number().int().positive()).min(1),
});

const SORT_COLUMNS = {
  id: charityOrganizationTable.id,
  name: charityOrganizationTable.name,
  sortOrder: charityOrganizationTable.sortOrder,
};

export const charityOrganizationSuggestQuerySchema = z.object({
  categoryId: z.coerce.number().int().positive(),
});

export const charityOrganizationListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sort: z.enum(['id', 'name', 'sortOrder']).optional().default('sortOrder'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
  categoryId: z.coerce.number().int().positive().optional(),
  // Spelled as the two literal strings rather than z.coerce.boolean(),
  // which maps every non-empty query value (including "false") to true.
  isActive: z.enum(['true', 'false']).optional(),
});


/**
 * Checks the categories an organisation is being filed under.
 *
 * An inactive category still exists -- past donations point at it and the
 * public record keeps naming it -- but it is out of circulation, so no
 * organisation should be newly filed under one.
 */
const validateCategoryIds = async (db: Db, categoryIds: number[]): Promise<number[]> => {
  const unique = [...new Set(categoryIds)];
  const rows = await db
    .select({ id: charityCategoryTable.id, isActive: charityCategoryTable.isActive })
    .from(charityCategoryTable)
    .where(inArray(charityCategoryTable.id, unique));
  if (rows.length !== unique.length) throw new BadRequestError('some categories do not exist');

  const inactive = rows.filter((row) => !row.isActive);
  if (inactive.length > 0)
    throw new BadRequestError(
      `category ${inactive.map((row) => row.id).join(',')} is not accepting organizations`
    );

  return unique;
};

/**
 * Rejects a tax id already used by a different organisation.
 *
 * The column is UNIQUE, so without this the duplicate surfaces as a
 * driver-level ER_DUP_ENTRY, which the error handler turns into a 500 --
 * an admin typing a 統編 that is already on file deserves to be told so.
 */
const assertTaxIdFree = async (db: Db, taxId: string | null | undefined, excludeId?: number) => {
  if (taxId === null || taxId === undefined) return;
  const rows = await db
    .select({ id: charityOrganizationTable.id })
    .from(charityOrganizationTable)
    .where(eq(charityOrganizationTable.taxId, taxId));
  const clash = rows.find((row) => row.id !== excludeId);
  if (clash) throw new BadRequestError(`tax id ${taxId} already belongs to organization ${clash.id}`);
};

/** The category rows for a set of organisations, keyed by organisation. */
const categoriesByOrganization = async (db: Db, organizationIds: number[]) => {
  const byOrganization = new Map<number, z.infer<typeof categoryRefSchema>[]>();
  if (organizationIds.length === 0) return byOrganization;

  const links = await db
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

  for (const link of links) {
    const list = byOrganization.get(link.organizationId) ?? [];
    list.push({ id: link.id, code: link.code, name: link.name });
    byOrganization.set(link.organizationId, list);
  }
  return byOrganization;
};

const replaceCategoryLinks = async (db: Db, organizationId: number, categoryIds: number[]) => {
  await db
    .delete(charityOrganizationCategoryTable)
    .where(eq(charityOrganizationCategoryTable.organizationId, organizationId));
  await db
    .insert(charityOrganizationCategoryTable)
    .values(categoryIds.map((categoryId) => ({ organizationId, categoryId })));
};

const findOrganization = async (db: Db, id: number) => {
  const [found] = await db
    .select()
    .from(charityOrganizationTable)
    .where(eq(charityOrganizationTable.id, id));
  if (found === undefined) throw new NotFoundError(`charity organization ${id} not found`);
  return found;
};


/**
 * An organisation as this API reports it.
 *
 * A schema rather than a hand-written type: it is the single description
 * of the response, every handler's return is checked against it, and the
 * OpenAPI document is generated from it. See "The OpenAPI document" in
 * AGENTS.md.
 */
const categoryRefSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  name: z.string(),
});

export const charityOrganizationSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  taxId: z.string().nullable().describe('The 統編. Null for associations that do not publish one'),
  introduction: z.string(),
  websiteUrl: z.string().nullable(),
  logoUrl: z.string().nullable(),
  sortOrder: z.number().int().describe('Ascending; ties are broken by id'),
  isActive: z
    .boolean()
    .describe('false takes it out of the picker; existing donations keep pointing at it'),
  categories: z
    .array(categoryRefSchema)
    .describe('Ordered by the category sortOrder, then id. Never empty: at least one is required'),
  createdAt: z.string().nullable().describe('ISO 8601'),
  updatedAt: z.string().nullable().describe('ISO 8601'),
});

export const getCharityOrganizationListResponseSchema = z.object({
  data: z.array(charityOrganizationSchema),
  paginate: paginationSchema,
});

export const putCharityOrganizationCategoryResponseSchema = z.object({
  categories: z.array(categoryRefSchema),
});

/**
 * Serialises an organisation row with its categories.
 *
 * The dates are converted here rather than left to `c.json`: the columns
 * are Dates, every type in the repo calls these fields strings, and
 * JSON.stringify happening to agree is not a contract. The bytes on the
 * wire are identical.
 *
 * Field by field, not a spread, so a column added to
 * `charity_organization` cannot reach a client without being described
 * first -- `satisfies` would not catch that on its own, since a row with
 * extra properties is still assignable.
 */
const buildDto = (
  row: typeof charityOrganizationTable.$inferSelect,
  categories: z.infer<typeof categoryRefSchema>[]
): z.infer<typeof charityOrganizationSchema> => ({
  id: row.id,
  name: row.name,
  taxId: row.taxId,
  introduction: row.introduction,
  websiteUrl: row.websiteUrl,
  logoUrl: row.logoUrl,
  sortOrder: row.sortOrder,
  isActive: row.isActive,
  categories,
  createdAt: row.createdAt?.toISOString() ?? null,
  updatedAt: row.updatedAt?.toISOString() ?? null,
});

/**
 * The OpenAPI entries for the routes below.
 *
 * Hoisted out of the route definitions so the handlers keep their own
 * indentation and each route line stays one line; `describeRoute` is
 * middleware, so where it is constructed makes no difference.
 *
 * The gate is stated per route because it is not uniform: `adminAuth`
 * checks POST/PUT/DELETE only, so every read here answers with no
 * credentials while every write is admin-only.
 */
const listDoc = describeRoute({
  summary: 'List the charity organisations',
  description:
    'Reads here need no credentials: the name, blurb and website of a foundation are what the public transparency page exists to show. `adminAuth` gates POST/PUT/DELETE only. Filterable by category and by isActive; an organisation filed under two categories still counts once, because the category filter resolves to a list of ids rather than joining.',
  tags: ['charity-organization'],
  responses: {
    200: {
      description: 'One page of organisations, each with its categories',
      content: {
        'application/json': { schema: resolver(getCharityOrganizationListResponseSchema) },
      },
    },
    400: { description: 'limit beyond the cap, or a malformed sort, order, categoryId or isActive' },
  },
});

const suggestDoc = describeRoute({
  summary: 'Suggest an organisation in a category',
  description:
    'Reads here need no credentials: the name, blurb and website of a foundation are what the public transparency page exists to show. `adminAuth` gates POST/PUT/DELETE only. Answers with the **least-supported** active organisation in the category -- least by summed donation amount, with sortOrder then id breaking ties, so an untouched category answers the same for everyone. It exists because the choice is the emotional payoff of the LV5 donation and therefore a wall for anyone without an opinion; it is a suggestion, not a hidden choice inside POST /api/donation, because the public record names the organisation and the user has to see who it is before confirming.',
  tags: ['charity-organization'],
  responses: {
    200: {
      description: 'The suggested organisation',
      content: { 'application/json': { schema: resolver(charityOrganizationSchema) } },
    },
    400: { description: 'categoryId missing or not a positive integer' },
    404: {
      description:
        'No such category, or no active organisation is filed under it (NO_ORGANIZATION_AVAILABLE)',
    },
  },
});

const getDoc = describeRoute({
  summary: 'Read one organisation',
  description: 'Reads here need no credentials: the name, blurb and website of a foundation are what the public transparency page exists to show. `adminAuth` gates POST/PUT/DELETE only.',
  tags: ['charity-organization'],
  responses: {
    200: {
      description: 'The organisation, with its categories',
      content: { 'application/json': { schema: resolver(charityOrganizationSchema) } },
    },
    404: { description: 'No such organisation' },
  },
});

const createDoc = describeRoute({
  summary: 'Create an organisation',
  description:
    'Admin only. At least one category is required: an organisation under none is offered to nobody.',
  tags: ['charity-organization'],
  responses: {
    201: {
      description: 'The organisation as saved',
      content: { 'application/json': { schema: resolver(charityOrganizationSchema) } },
    },
    400: {
      description:
        'A malformed body, a URL not starting with http:// or https://, a taxId that is not 8 digits or already belongs to another organisation, an empty categoryIds, a category that does not exist, or one that is no longer accepting organisations',
    },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
  },
});

const updateDoc = describeRoute({
  summary: 'Update an organisation',
  description:
    'Admin only. Every field in the body is required -- this is a replace, not a patch -- and the category links are replaced wholesale with the ids sent.',
  tags: ['charity-organization'],
  responses: {
    200: {
      description: 'The organisation as saved',
      content: { 'application/json': { schema: resolver(charityOrganizationSchema) } },
    },
    400: { description: 'The same cases as the create, with the taxId check ignoring this row' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
    404: { description: 'No such organisation' },
  },
});

const putCategoryDoc = describeRoute({
  summary: "Replace an organisation's categories",
  description:
    'Admin only. A full-set replace, not a merge, and at least one id is required. An inactive category is refused: it still exists, because past donations point at it, but nothing should be newly filed under one.',
  tags: ['charity-organization'],
  responses: {
    200: {
      description: 'The categories as saved',
      content: {
        'application/json': {
          schema: resolver(putCharityOrganizationCategoryResponseSchema),
        },
      },
    },
    400: {
      description:
        'An empty categoryIds, a category that does not exist, or one that is not accepting organisations',
    },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
    404: { description: 'No such organisation' },
  },
});

const deleteDoc = describeRoute({
  summary: 'Delete an organisation',
  description:
    'Admin only, and only one that has taken no money: an organisation named on the public record has to keep being nameable, and the agreed handling for a foundation that folds is to repoint its donations at another, never to erase it. Use isActive to take one out of circulation.',
  tags: ['charity-organization'],
  responses: {
    204: { description: 'Deleted' },
    400: { description: 'It has donations or payout batches; deactivate it instead' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
    404: { description: 'No such organisation' },
  },
});

export const charityOrganization = new Hono<TransactionEnv>()
  .get('/', listDoc, zValidator('query', charityOrganizationListQuerySchema), async (c) => {
    const { limit, offset, sort, order, categoryId, isActive } = c.req.valid('query');
    console.log(
      `GET /api/charity-organization limit=${limit} offset=${offset} sort=${sort} order=${order} categoryId=${categoryId ?? ''} isActive=${isActive ?? ''}`
    );
    const db = c.get('db');

    const conditions = [];
    if (isActive !== undefined)
      conditions.push(eq(charityOrganizationTable.isActive, isActive === 'true'));
    if (categoryId !== undefined) {
      // Resolved to a list of organisation ids rather than joined in, so
      // one row stays one row -- an organisation filed under two
      // categories would otherwise be counted twice by paginate.total.
      const links = await db
        .select({ organizationId: charityOrganizationCategoryTable.organizationId })
        .from(charityOrganizationCategoryTable)
        .where(eq(charityOrganizationCategoryTable.categoryId, categoryId));
      const ids = links.map((link) => link.organizationId);
      // No organisation is in this category: answer an empty page rather
      // than build an `IN ()`, which is not valid SQL.
      if (ids.length === 0)
        return c.json({
          data: [],
          paginate: genPagination(0, limit, offset),
        } satisfies z.infer<typeof getCharityOrganizationListResponseSchema>);
      conditions.push(inArray(charityOrganizationTable.id, ids));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db
      .select({ total: count() })
      .from(charityOrganizationTable)
      .where(where);
    const sortColumn = SORT_COLUMNS[sort];
    const rows = await db
      .select()
      .from(charityOrganizationTable)
      .where(where)
      // id as the tiebreaker: sortOrder defaults to 0 for every row, so
      // without it the default ordering is whatever MySQL happens to
      // return and a paginated list can repeat or skip rows between pages.
      .orderBy(
        order === 'desc' ? desc(sortColumn) : asc(sortColumn),
        asc(charityOrganizationTable.id)
      )
      .limit(limit)
      .offset(offset);

    const categories = await categoriesByOrganization(
      db,
      rows.map((row) => row.id)
    );
    const data = rows.map((row) => buildDto(row, categories.get(row.id) ?? []));

    return c.json({
      data,
      paginate: genPagination(total, limit, offset),
    } satisfies z.infer<typeof getCharityOrganizationListResponseSchema>);
  })
  /**
   * One organisation for a user who has no preference of their own.
   *
   * Exists because the choice is the whole emotional payoff of the LV5
   * donation, which makes it a wall for anyone who does not have an
   * opinion: they close the page, no `donation` row is ever written, and
   * the promise stays an unconfirmed number in /api/info/donation's
   * pendingCount. A way out of that screen is worth more than insisting
   * everyone decides.
   *
   * It suggests the **least-supported** organisation rather than a random
   * one, for two reasons: the result can be explained on the public page
   * ("this went to the organisation with the least support so far"), and
   * it spreads donations evenly instead of letting whichever row sorts
   * first collect most of them.
   *
   * Deliberately a suggestion, not a hidden choice inside
   * POST /api/donation: the record and the public page both name the
   * organisation, so the user has to see who it is before confirming.
   * They can still pick someone else afterwards.
   *
   * Declared before `/:id` on purpose -- Hono matches in order, so with
   * the two swapped this path would hit the id handler as Number('suggest')
   * = NaN. There is a test pinning that.
   */
  .get('/suggest', suggestDoc, zValidator('query', charityOrganizationSuggestQuerySchema), async (c) => {
    const db = c.get('db');
    const { categoryId } = c.req.valid('query');
    console.log(`GET /api/charity-organization/suggest categoryId=${categoryId}`);

    const [category] = await db
      .select({ id: charityCategoryTable.id })
      .from(charityCategoryTable)
      .where(eq(charityCategoryTable.id, categoryId));
    if (category === undefined) throw new NotFoundError(`charity category ${categoryId} not found`);

    // Summed amount, not a count of rows: amounts are uniform today but
    // donation.amount is frozen per row precisely because that can change,
    // and "least supported" is a statement about money. With uniform
    // amounts this orders identically to a count.
    //
    // Left join so an organisation nobody has chosen yet takes part at
    // all -- it has no donation rows, and an inner join would rank it
    // last by excluding it instead of first by counting zero.
    //
    // The total is the organisation's own, across every category it is
    // filed under: the money it received is the money it received,
    // regardless of which category routed it there.
    // One expression, used by both the projection and the ordering. Two
    // copies drift apart the moment one of them is edited -- and the
    // selected value is read by nothing, so editing only it changes
    // nothing while looking like it has.
    const supported = sql<number>`cast(coalesce(sum(${donationTable.amount}), 0) as signed)`;
    const [suggestion] = await db
      .select({ id: charityOrganizationTable.id, supported })
      .from(charityOrganizationTable)
      .innerJoin(
        charityOrganizationCategoryTable,
        and(
          eq(charityOrganizationCategoryTable.organizationId, charityOrganizationTable.id),
          eq(charityOrganizationCategoryTable.categoryId, categoryId)
        )
      )
      .leftJoin(donationTable, eq(donationTable.organizationId, charityOrganizationTable.id))
      // Only organisations still accepting donations: POST /api/donation
      // refuses an inactive one, so suggesting it would be a dead end.
      .where(eq(charityOrganizationTable.isActive, true))
      .groupBy(charityOrganizationTable.id)
      // sortOrder then id as tiebreakers, so an untouched category (every
      // total zero) returns the same answer to everyone who asks rather
      // than whatever MySQL happens to return first.
      .orderBy(
        asc(supported),
        asc(charityOrganizationTable.sortOrder),
        asc(charityOrganizationTable.id)
      )
      .limit(1);
    if (suggestion === undefined)
      throw new NotFoundError(
        `no active organization is filed under charity category ${categoryId}`,
        'NO_ORGANIZATION_AVAILABLE'
      );

    const found = await findOrganization(db, suggestion.id);
    const categories = await categoriesByOrganization(db, [suggestion.id]);

    return c.json(
      buildDto(found, categories.get(suggestion.id) ?? []) satisfies z.infer<
        typeof charityOrganizationSchema
      >
    );
  })
  .get('/:id', getDoc, async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`GET /api/charity-organization/${id}`);

    const found = await findOrganization(db, id);
    const categories = await categoriesByOrganization(db, [id]);

    return c.json(
      buildDto(found, categories.get(id) ?? []) satisfies z.infer<
        typeof charityOrganizationSchema
      >
    );
  })
  .post('/', createDoc, zValidator('json', charityOrganizationBodySchema), async (c) => {
    const db = c.get('db');
    const data = c.req.valid('json');
    console.log(
      `POST /api/charity-organization name=${data.name} categoryIds=${data.categoryIds.join(',')}`
    );

    const categoryIds = await validateCategoryIds(db, data.categoryIds);
    await assertTaxIdFree(db, data.taxId);

    const now = new Date();
    const [{ insertId }] = await db.insert(charityOrganizationTable).values({
      name: data.name,
      taxId: data.taxId ?? null,
      introduction: data.introduction,
      websiteUrl: data.websiteUrl ?? null,
      logoUrl: data.logoUrl ?? null,
      sortOrder: data.sortOrder,
      isActive: data.isActive,
      createdAt: now,
      updatedAt: now,
    });
    await replaceCategoryLinks(db, insertId, categoryIds);

    const saved = await findOrganization(db, insertId);
    const categories = await categoriesByOrganization(db, [insertId]);

    return c.json(
      buildDto(saved, categories.get(insertId) ?? []) satisfies z.infer<
        typeof charityOrganizationSchema
      >,
      201
    );
  })
  .put('/:id', updateDoc, zValidator('json', charityOrganizationBodySchema), async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    const data = c.req.valid('json');
    console.log(`PUT /api/charity-organization/${id} name=${data.name}`);

    await findOrganization(db, id);
    const categoryIds = await validateCategoryIds(db, data.categoryIds);
    await assertTaxIdFree(db, data.taxId, id);

    await db
      .update(charityOrganizationTable)
      .set({
        name: data.name,
        taxId: data.taxId ?? null,
        introduction: data.introduction,
        websiteUrl: data.websiteUrl ?? null,
        logoUrl: data.logoUrl ?? null,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
        updatedAt: new Date(),
      })
      .where(eq(charityOrganizationTable.id, id));
    await replaceCategoryLinks(db, id, categoryIds);

    const updated = await findOrganization(db, id);
    const categories = await categoriesByOrganization(db, [id]);

    return c.json(
      buildDto(updated, categories.get(id) ?? []) satisfies z.infer<
        typeof charityOrganizationSchema
      >
    );
  })
  .put('/:id/category', putCategoryDoc, zValidator('json', charityOrganizationCategoryBodySchema), async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    const { categoryIds } = c.req.valid('json');
    console.log(
      `PUT /api/charity-organization/${id}/category categoryIds=${categoryIds.join(',')}`
    );

    await findOrganization(db, id);
    const validated = await validateCategoryIds(db, categoryIds);
    await replaceCategoryLinks(db, id, validated);

    const categories = await categoriesByOrganization(db, [id]);

    return c.json({
      categories: categories.get(id) ?? [],
    } satisfies z.infer<typeof putCharityOrganizationCategoryResponseSchema>);
  })
  .delete('/:id', deleteDoc, async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`DELETE /api/charity-organization/${id}`);

    await findOrganization(db, id);

    // An organisation that has taken money is part of the record, and the
    // public page has to keep naming it. Both of these are also FKs, so
    // without the check the delete fails as a 500 instead; and the agreed
    // handling for a foundation that folds is to repoint the existing
    // donation rows at another organisation, never to erase it. isActive
    // is what takes one out of circulation.
    const [{ total: donations }] = await db
      .select({ total: count() })
      .from(donationTable)
      .where(eq(donationTable.organizationId, id));
    const [{ total: batches }] = await db
      .select({ total: count() })
      .from(donationBatchTable)
      .where(eq(donationBatchTable.organizationId, id));
    if (donations > 0 || batches > 0)
      throw new BadRequestError(
        `charity organization ${id} has ${donations} donation(s) and ${batches} batch(es); deactivate it instead of deleting`
      );

    await db
      .delete(charityOrganizationCategoryTable)
      .where(eq(charityOrganizationCategoryTable.organizationId, id));
    await db.delete(charityOrganizationTable).where(eq(charityOrganizationTable.id, id));

    return c.body(null, 204);
  });
