import { zValidator } from '@hono/zod-validator';
import { asc, count, desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import {
  categoryTable,
  conceptGroupTable,
  conceptTable,
  examSubjectTable,
  examTable,
  subjectCategoryTable,
  subjectTable,
  tagTable,
} from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT, paginationSchema } from 'src/lib/paginator';
import { TransactionEnv } from 'src/middleware/transaction';
import { NotFoundError } from 'src/model/error';

export const subjectBodySchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().min(0).max(255).optional().default(0),
});

export const subjectCategoryBodySchema = z.object({
  categoryIds: z.array(z.number().int().positive()),
});

// Reused in both the SELECT list and ORDER BY below -- same JS reference,
// so the identical GROUP_CONCAT expression is emitted in both places,
// which MySQL requires for ordering by an aggregate in a grouped query.
const categoriesExpr = sql<string | null>`GROUP_CONCAT(
  ${categoryTable.name} ORDER BY ${categoryTable.name} SEPARATOR ', '
)`;

const SUBJECT_SORT_COLUMNS = {
  id: subjectTable.id,
  name: subjectTable.name,
  sortOrder: subjectTable.sortOrder,
  categories: categoriesExpr,
};

export const subjectListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sort: z.enum(['id', 'name', 'sortOrder', 'categories']).optional().default('sortOrder'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

/**
 * A subject as this API reports it.
 *
 * Four fields, which is one fewer than the table has: `subject` also
 * carries `duration_median_ms`, an internal statistic the points
 * time-weight reads (see questionStat.ts). Every one of these handlers
 * used to send it, because they returned `db.select()` unexamined --
 * described by no type, read by no client, and the kind of thing a
 * document is for noticing.
 */
export const subjectSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  sortOrder: z.number().int().describe('Ascending; what the practice page orders subjects by'),
  createdAt: z.string().nullable().describe('ISO 8601'),
});

/**
 * Serialises a subject row.
 *
 * `createdAt` is converted here rather than left to `c.json`: the column
 * is a Date, every type in the repo calls this field a string, and
 * JSON.stringify happening to agree is not a contract. Field by field,
 * not a spread, so a column added to `subject` cannot reach a client
 * without being described first -- which is exactly how the median got
 * out.
 */
const toSubjectDto = (row: {
  id: number;
  name: string;
  sortOrder: number;
  createdAt: Date | null;
}): z.infer<typeof subjectSchema> => ({
  id: row.id,
  name: row.name,
  sortOrder: row.sortOrder,
  createdAt: row.createdAt?.toISOString() ?? null,
});

/** An id and a name: what the pickers in the admin UI need. */
const namedSchema = z.object({ id: z.number().int(), name: z.string() });

export const getSubjectListResponseSchema = z.object({
  data: z.array(
    subjectSchema.extend({
      categories: z
        .string()
        .nullable()
        .describe(
          "The subject's category names, comma-separated, or null when it has none. A read-only summary for the admin list -- categories are edited through /api/subject/{id}/category."
        ),
    })
  ),
  paginate: paginationSchema,
});

export const getSubjectByIdResponseSchema = subjectSchema.extend({
  exams: z.array(namedSchema),
  tags: z.array(namedSchema),
  conceptGroups: z.array(namedSchema.extend({ concepts: z.array(namedSchema) })),
});

export const subjectCategoryResponseSchema = z.object({
  categoryIds: z.array(z.number().int()),
});

/**
 * The OpenAPI entries for the routes below.
 *
 * Hoisted out of the route definitions so the handlers keep their own
 * indentation and each route line stays one line; `describeRoute` is
 * middleware, so where it is constructed makes no difference.
 *
 * The gate is stated per route because it is not uniform: `adminAuth`
 * checks POST/PUT/DELETE only, so every read in this group answers
 * without any credentials while every write is admin-only. That is
 * deliberate -- see the middleware's own comment: this is catalog
 * content, not anything that reads as PII -- and it is the first thing
 * whoever writes a client needs to know.
 */
const listDoc = describeRoute({
  summary: 'List subjects',
  description:
    'Reads here need no credentials: `adminAuth` gates POST/PUT/DELETE only. Paginated, sortable by id, name, sortOrder or category names.',
  tags: ['subject'],
  responses: {
    200: {
      description: 'One page of subjects',
      content: { 'application/json': { schema: resolver(getSubjectListResponseSchema) } },
    },
    400: { description: 'limit beyond the cap, or a malformed sort or order' },
  },
});

const getDoc = describeRoute({
  summary: 'Read one subject, with its exams, tags and concept groups',
  description:
    'Reads here need no credentials: `adminAuth` gates POST/PUT/DELETE only. All three lists come with it because the "add questions" flow needs them for this one subject up front.',
  tags: ['subject'],
  responses: {
    200: {
      description: 'The subject and its three lists',
      content: { 'application/json': { schema: resolver(getSubjectByIdResponseSchema) } },
    },
    404: { description: 'No such subject' },
  },
});

const createDoc = describeRoute({
  summary: 'Create a subject',
  description: 'Admin only. No categories, exams or tags are attached; those are separate saves.',
  tags: ['subject'],
  responses: {
    201: {
      description: 'The subject as saved',
      content: { 'application/json': { schema: resolver(subjectSchema) } },
    },
    400: { description: 'An empty name, or a sortOrder outside 0-255' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
  },
});

const updateDoc = describeRoute({
  summary: "Change a subject's name or sort order",
  description: 'Admin only.',
  tags: ['subject'],
  responses: {
    200: {
      description: 'The subject as saved',
      content: { 'application/json': { schema: resolver(subjectSchema) } },
    },
    400: { description: 'An empty name, or a sortOrder outside 0-255' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
    404: { description: 'No such subject' },
  },
});

const deleteDoc = describeRoute({
  summary: 'Delete a subject',
  description:
    "Admin only. Clears the subject's category and exam links first, so one that is still linked can be deleted; the categories and exams themselves are left alone.",
  tags: ['subject'],
  responses: {
    204: { description: 'Deleted' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
    404: { description: 'No such subject' },
  },
});

const getCategoryDoc = describeRoute({
  summary: 'The categories a subject is filed under',
  description: 'Reads here need no credentials: `adminAuth` gates POST/PUT/DELETE only. Ids alone: the names come from GET /api/category.',
  tags: ['subject'],
  responses: {
    200: {
      description: 'The category ids',
      content: { 'application/json': { schema: resolver(subjectCategoryResponseSchema) } },
    },
    404: { description: 'No such subject' },
  },
});

const putCategoryDoc = describeRoute({
  summary: 'Replace the categories a subject is filed under',
  description:
    'Admin only. A full-set replace, not a merge: the ids sent are the categories afterwards, and an empty array files it under none.',
  tags: ['subject'],
  responses: {
    200: {
      description: 'The category ids as saved',
      content: { 'application/json': { schema: resolver(subjectCategoryResponseSchema) } },
    },
    400: { description: 'categoryIds missing, or not an array of positive integers' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
    404: { description: 'No such subject' },
  },
});

export const subject = new Hono<TransactionEnv>()
  .get('/', listDoc, zValidator('query', subjectListQuerySchema), async (c) => {
    const { limit, offset, sort, order } = c.req.valid('query');
    console.log(
      `GET /api/subject limit=${limit} offset=${offset} sort=${sort} order=${order}`
    );
    const db = c.get('db');

    const [{ total }] = await db.select({ total: count() }).from(subjectTable);
    const sortColumn = SUBJECT_SORT_COLUMNS[sort];
    const data = await db
      .select({
        id: subjectTable.id,
        name: subjectTable.name,
        sortOrder: subjectTable.sortOrder,
        createdAt: subjectTable.createdAt,
        // Read-only summary for the admin list -- categories aren't
        // editable through this endpoint, so a formatted CSV string is
        // all the UI needs (no reason to ship structured category data
        // the client can't act on).
        categories: categoriesExpr,
      })
      .from(subjectTable)
      .leftJoin(
        subjectCategoryTable,
        eq(subjectCategoryTable.subjectId, subjectTable.id)
      )
      .leftJoin(
        categoryTable,
        eq(categoryTable.id, subjectCategoryTable.categoryId)
      )
      .groupBy(subjectTable.id)
      .orderBy(order === 'desc' ? desc(sortColumn) : asc(sortColumn))
      .limit(limit)
      .offset(offset);

    return c.json({
      // The row carries the median; the DTO does not, and `categories`
      // is put back because it is this endpoint's own aggregate.
      data: data.map(({ categories, ...row }) => ({ ...toSubjectDto(row), categories })),
      paginate: genPagination(total, limit, offset),
    } satisfies z.infer<typeof getSubjectListResponseSchema>);
  })
  .get('/:id', getDoc, async (c) => {
    const id = Number(c.req.param('id'));
    console.log(`GET /api/subject/${id}`);
    const db = c.get('db');
    const [found] = await db
      .select()
      .from(subjectTable)
      .where(eq(subjectTable.id, id));
    if (found === undefined)
      throw new NotFoundError(`subject ${id} not found`);

    // Bundled for the "add questions" flow, which needs all three lists
    // for this one subject up front -- kept as separate queries (rather
    // than joined into the subject query above) so none of them can fan
    // out and duplicate rows in another.
    const exams = await db
      .select({ id: examTable.id, name: examTable.name })
      .from(examTable)
      .innerJoin(examSubjectTable, eq(examSubjectTable.examId, examTable.id))
      .where(eq(examSubjectTable.subjectId, id));

    const tags = await db
      .select({ id: tagTable.id, name: tagTable.name })
      .from(tagTable)
      .where(eq(tagTable.subjectId, id));

    const conceptRows = await db
      .select({
        groupId: conceptGroupTable.id,
        groupName: conceptGroupTable.name,
        conceptId: conceptTable.id,
        conceptName: conceptTable.name,
      })
      .from(conceptGroupTable)
      .leftJoin(
        conceptTable,
        eq(conceptTable.conceptGroupId, conceptGroupTable.id)
      )
      .where(eq(conceptGroupTable.subjectId, id));
    const conceptGroupById = new Map<
      number,
      { id: number; name: string; concepts: { id: number; name: string }[] }
    >();
    for (const row of conceptRows) {
      const group = conceptGroupById.get(row.groupId) ?? {
        id: row.groupId,
        name: row.groupName,
        concepts: [],
      };
      if (row.conceptId !== null)
        group.concepts.push({ id: row.conceptId, name: row.conceptName! });
      conceptGroupById.set(row.groupId, group);
    }

    return c.json({
      ...toSubjectDto(found),
      exams,
      tags,
      conceptGroups: [...conceptGroupById.values()],
    } satisfies z.infer<typeof getSubjectByIdResponseSchema>);
  })
  .post('/', createDoc, zValidator('json', subjectBodySchema), async (c) => {
    const { name, sortOrder } = c.req.valid('json');
    console.log(`POST /api/subject name=${name} sortOrder=${sortOrder}`);
    const db = c.get('db');

    const [{ insertId }] = await db
      .insert(subjectTable)
      .values({ name, sortOrder, createdAt: new Date() });
    const [saved] = await db
      .select()
      .from(subjectTable)
      .where(eq(subjectTable.id, insertId));

    return c.json(toSubjectDto(saved) satisfies z.infer<typeof subjectSchema>, 201);
  })
  .put('/:id', updateDoc, zValidator('json', subjectBodySchema), async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    const { name, sortOrder } = c.req.valid('json');
    console.log(
      `PUT /api/subject/${id} name=${name} sortOrder=${sortOrder}`
    );

    const [{ affectedRows }] = await db
      .update(subjectTable)
      .set({ name, sortOrder })
      .where(eq(subjectTable.id, id));
    if (affectedRows === 0)
      throw new NotFoundError(`subject ${id} not found`);

    const [updated] = await db
      .select()
      .from(subjectTable)
      .where(eq(subjectTable.id, id));

    return c.json(toSubjectDto(updated) satisfies z.infer<typeof subjectSchema>);
  })
  .delete('/:id', deleteDoc, async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`DELETE /api/subject/${id}`);

    // Clear subject_category and exam_subject links first -- the FKs would
    // otherwise reject deleting a subject that's still referenced there.
    await db
      .delete(subjectCategoryTable)
      .where(eq(subjectCategoryTable.subjectId, id));
    await db
      .delete(examSubjectTable)
      .where(eq(examSubjectTable.subjectId, id));
    const [{ affectedRows }] = await db
      .delete(subjectTable)
      .where(eq(subjectTable.id, id));
    if (affectedRows === 0)
      throw new NotFoundError(`subject ${id} not found`);

    return c.body(null, 204);
  })
  .get('/:id/category', getCategoryDoc, async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`GET /api/subject/${id}/category`);

    const [found] = await db
      .select()
      .from(subjectTable)
      .where(eq(subjectTable.id, id));
    if (found === undefined)
      throw new NotFoundError(`subject ${id} not found`);

    const links = await db
      .select({ categoryId: subjectCategoryTable.categoryId })
      .from(subjectCategoryTable)
      .where(eq(subjectCategoryTable.subjectId, id));

    return c.json({
      categoryIds: links.map((l) => l.categoryId),
    } satisfies z.infer<typeof subjectCategoryResponseSchema>);
  })
  .put(
    '/:id/category',
    putCategoryDoc,
    zValidator('json', subjectCategoryBodySchema),
    async (c) => {
      const db = c.get('db');
      const id = Number(c.req.param('id'));
      const { categoryIds } = c.req.valid('json');
      console.log(
        `PUT /api/subject/${id}/category categoryIds=${categoryIds.join(',')}`
      );

      const [found] = await db
        .select()
        .from(subjectTable)
        .where(eq(subjectTable.id, id));
      if (found === undefined)
        throw new NotFoundError(`subject ${id} not found`);

      // Full-set replace: simplest correct semantics for a multi-select
      // "these are the categories now" save, and cheap at this table size.
      await db
        .delete(subjectCategoryTable)
        .where(eq(subjectCategoryTable.subjectId, id));
      if (categoryIds.length > 0)
        await db
          .insert(subjectCategoryTable)
          .values(
            categoryIds.map((categoryId) => ({ subjectId: id, categoryId }))
          );

      const links = await db
        .select({ categoryId: subjectCategoryTable.categoryId })
        .from(subjectCategoryTable)
        .where(eq(subjectCategoryTable.subjectId, id));

      return c.json({
        categoryIds: links.map((l) => l.categoryId),
      } satisfies z.infer<typeof subjectCategoryResponseSchema>);
    }
  );
