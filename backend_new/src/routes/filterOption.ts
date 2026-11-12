import 'zod-openapi/extend';
import { zValidator } from '@hono/zod-validator';
import { asc, count, desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import {
  filterDimensionTable,
  filterOptionTable,
  filterSubjectOptionTable,
  subjectTable,
} from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT, paginationSchema } from 'src/lib/paginator';
import { TransactionEnv } from 'src/middleware/transaction';
import { NotFoundError } from 'src/model/error';

export const filterOptionBodySchema = z.object({
  name: z.string().min(1),
  dimensionId: z.number().int().positive(),
  // Nullable, not just optional -- "no parent" is a real, settable state
  // (a top-level option), distinct from "field omitted".
  parentId: z.number().int().positive().nullable().optional().default(null),
});

export const filterOptionSubjectBodySchema = z.object({
  subjectIds: z.array(z.number().int().positive()),
});

// Reused in both the SELECT list and ORDER BY below -- same JS reference,
// so the identical GROUP_CONCAT expression is emitted in both places,
// which MySQL requires for ordering by an aggregate in a grouped query.
const subjectsExpr = sql<string | null>`GROUP_CONCAT(
  ${subjectTable.name} ORDER BY ${subjectTable.name} SEPARATOR ', '
)`;

// "dimension" sorts by the linked dimension's name -- requires a join
// purely for ordering; the response shape stays
// {id, name, dimensionId, parentId, subjects} since the admin UI already
// resolves dimension/parent display info from its own separately-fetched
// lists -- "subjects" is a read-only summary of the filter_subject_option
// links, not editable through this endpoint.
// No sort-by-parent column: parentId is optional and secondary to the
// dimension grouping, and sorting by it would need a self-join alias for
// little practical benefit over the id/name/dimension/subjects sorts
// already here.
const FILTER_OPTION_SORT_COLUMNS = {
  id: filterOptionTable.id,
  name: filterOptionTable.name,
  dimension: filterDimensionTable.name,
  subjects: subjectsExpr,
};

export const filterOptionListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sort: z.enum(['id', 'name', 'dimension', 'subjects']).optional().default('id'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

/**
 * A filter option as this API reports it.
 *
 * Four fields and no timestamp, because the table has none.
 *
 * Field by field in the DTO below, not a spread: `satisfies` alone would
 * not catch a column added to `filter_option` reaching a client, since a
 * row with extra properties is still assignable.
 */
export const filterOptionSchema = z.object({
  id: z.number().int(),
  dimensionId: z.number().int(),
  parentId: z
    .number()
    .int()
    .nullable()
    .describe('The option this one hangs under, or null for a top-level option'),
  name: z.string(),
}).openapi({ ref: 'FilterOption' });

const toFilterOptionDto = (row: {
  id: number;
  dimensionId: number;
  parentId: number | null;
  name: string;
}): z.infer<typeof filterOptionSchema> => ({
  id: row.id,
  dimensionId: row.dimensionId,
  parentId: row.parentId,
  name: row.name,
});

export const getFilterOptionListResponseSchema = z.object({
  data: z.array(
    filterOptionSchema.extend({
      subjects: z
        .string()
        .nullable()
        .describe(
          "The names of the subjects this option selects, comma-separated, or null when it selects none. A read-only summary for the admin list -- the links are edited through /api/filter-option/{id}/subject."
        ),
    })
  ),
  paginate: paginationSchema,
});

export const filterOptionSubjectResponseSchema = z.object({
  subjectIds: z.array(z.number().int()),
});

/**
 * The OpenAPI entries for the routes below.
 *
 * Hoisted out of the route definitions so the handlers keep their own
 * indentation and each route line stays one line; `describeRoute` is
 * middleware, so where it is constructed makes no difference.
 *
 * The gate is stated per route because it is not uniform: `adminAuth`
 * checks POST/PUT/DELETE only, so every read in this group answers with
 * no credentials while every write is admin-only.
 */
const listDoc = describeRoute({
  summary: 'List filter options',
  description:
    'Reads here need no credentials: `adminAuth` gates POST/PUT/DELETE only. Paginated, sortable by id, name, the dimension name or the subject names.',
  tags: ['filter-option'],
  responses: {
    200: {
      description: 'One page of filter options',
      content: { 'application/json': { schema: resolver(getFilterOptionListResponseSchema) } },
    },
    400: { description: 'limit beyond the cap, or a malformed sort or order' },
  },
});

const getDoc = describeRoute({
  summary: 'Read one filter option',
  description: 'Reads here need no credentials: `adminAuth` gates POST/PUT/DELETE only.',
  tags: ['filter-option'],
  responses: {
    200: {
      description: 'The filter option',
      content: { 'application/json': { schema: resolver(filterOptionSchema) } },
    },
    404: { description: 'No such filter option' },
  },
});

const createDoc = describeRoute({
  summary: 'Create a filter option',
  description: 'Admin only.',
  tags: ['filter-option'],
  responses: {
    201: {
      description: 'The filter option as saved',
      content: { 'application/json': { schema: resolver(filterOptionSchema) } },
    },
    400: { description: 'An empty name, a missing or non-positive dimensionId, or a non-positive parentId' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
  },
});

const updateDoc = describeRoute({
  summary: 'Update a filter option',
  description: 'Admin only. Every field in the body is required -- this is a replace, not a patch.',
  tags: ['filter-option'],
  responses: {
    200: {
      description: 'The filter option as saved',
      content: { 'application/json': { schema: resolver(filterOptionSchema) } },
    },
    400: { description: 'An empty name, a missing or non-positive dimensionId, or a non-positive parentId' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
    404: { description: 'No such filter option' },
  },
});

const deleteDoc = describeRoute({
  summary: 'Delete a filter option',
  description:
    'Admin only. Admin only. A child option pointing at this one is made top-level rather than deleted, and the subject links go -- a join row has no meaning once a side of it is gone.',
  tags: ['filter-option'],
  responses: {
    204: { description: 'Deleted' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
    404: { description: 'No such filter option' },
  },
});

const getSubjectDoc = describeRoute({
  summary: 'The subjects a filter option selects',
  description:
    'Reads here need no credentials: `adminAuth` gates POST/PUT/DELETE only. Ids alone: the names come from GET /api/subject.',
  tags: ['filter-option'],
  responses: {
    200: {
      description: 'The subject ids',
      content: { 'application/json': { schema: resolver(filterOptionSubjectResponseSchema) } },
    },
    404: { description: 'No such filter option' },
  },
});

const putSubjectDoc = describeRoute({
  summary: 'Replace the subjects a filter option selects',
  description:
    'Admin only. A full-set replace, not a merge: the ids sent are the subjects afterwards, and an empty array leaves the option selecting none.',
  tags: ['filter-option'],
  responses: {
    200: {
      description: 'The subject ids as saved',
      content: { 'application/json': { schema: resolver(filterOptionSubjectResponseSchema) } },
    },
    400: { description: 'subjectIds missing, or not an array of positive integers' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
    404: { description: 'No such filter option' },
  },
});

export const filterOption = new Hono<TransactionEnv>()
  .get('/', listDoc, zValidator('query', filterOptionListQuerySchema), async (c) => {
    const { limit, offset, sort, order } = c.req.valid('query');
    console.log(
      `GET /api/filter-option limit=${limit} offset=${offset} sort=${sort} order=${order}`
    );
    const db = c.get('db');

    const [{ total }] = await db
      .select({ total: count() })
      .from(filterOptionTable);
    const sortColumn = FILTER_OPTION_SORT_COLUMNS[sort];
    const data = await db
      .select({
        id: filterOptionTable.id,
        name: filterOptionTable.name,
        dimensionId: filterOptionTable.dimensionId,
        parentId: filterOptionTable.parentId,
        subjects: subjectsExpr,
      })
      .from(filterOptionTable)
      .innerJoin(
        filterDimensionTable,
        eq(filterDimensionTable.id, filterOptionTable.dimensionId)
      )
      .leftJoin(
        filterSubjectOptionTable,
        eq(filterSubjectOptionTable.optionId, filterOptionTable.id)
      )
      .leftJoin(
        subjectTable,
        eq(subjectTable.id, filterSubjectOptionTable.subjectId)
      )
      .groupBy(filterOptionTable.id)
      .orderBy(order === 'desc' ? desc(sortColumn) : asc(sortColumn))
      .limit(limit)
      .offset(offset);

    return c.json({
      // `subjects` is put back because it is this endpoint's own
      // aggregate rather than a column of filter_option.
      data: data.map(({ subjects, ...row }) => ({ ...toFilterOptionDto(row), subjects })),
      paginate: genPagination(total, limit, offset),
    } satisfies z.infer<typeof getFilterOptionListResponseSchema>);
  })
  .get('/:id', getDoc, async (c) => {
    const id = c.req.param('id');
    console.log(`GET /api/filter-option/${id}`);
    const [found] = await c
      .get('db')
      .select()
      .from(filterOptionTable)
      .where(eq(filterOptionTable.id, Number(id)));
    if (found === undefined)
      throw new NotFoundError(`filter option ${id} not found`);

    return c.json(toFilterOptionDto(found) satisfies z.infer<typeof filterOptionSchema>);
  })
  .post('/', createDoc, zValidator('json', filterOptionBodySchema), async (c) => {
    const { name, dimensionId, parentId } = c.req.valid('json');
    console.log(
      `POST /api/filter-option name=${name} dimensionId=${dimensionId} parentId=${parentId}`
    );
    const db = c.get('db');

    const [{ insertId }] = await db
      .insert(filterOptionTable)
      .values({ name, dimensionId, parentId });
    const [saved] = await db
      .select()
      .from(filterOptionTable)
      .where(eq(filterOptionTable.id, insertId));

    return c.json(toFilterOptionDto(saved) satisfies z.infer<typeof filterOptionSchema>, 201);
  })
  .put('/:id', updateDoc, zValidator('json', filterOptionBodySchema), async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    const { name, dimensionId, parentId } = c.req.valid('json');
    console.log(
      `PUT /api/filter-option/${id} name=${name} dimensionId=${dimensionId} parentId=${parentId}`
    );

    const [{ affectedRows }] = await db
      .update(filterOptionTable)
      .set({ name, dimensionId, parentId })
      .where(eq(filterOptionTable.id, id));
    if (affectedRows === 0)
      throw new NotFoundError(`filter option ${id} not found`);

    const [updated] = await db
      .select()
      .from(filterOptionTable)
      .where(eq(filterOptionTable.id, id));

    return c.json(toFilterOptionDto(updated) satisfies z.infer<typeof filterOptionSchema>);
  })
  .delete('/:id', deleteDoc, async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`DELETE /api/filter-option/${id}`);

    // parentId is optional, so a child pointing at this option should just
    // become top-level rather than block the delete or get destroyed --
    // unlike the required-FK precedent used for dimension_id/subject_id.
    await db
      .update(filterOptionTable)
      .set({ parentId: null })
      .where(eq(filterOptionTable.parentId, id));
    // Clear filter_subject_option links -- same reasoning as
    // subject_category/exam_subject: a pure join row has no meaning once
    // either side is gone.
    await db
      .delete(filterSubjectOptionTable)
      .where(eq(filterSubjectOptionTable.optionId, id));
    const [{ affectedRows }] = await db
      .delete(filterOptionTable)
      .where(eq(filterOptionTable.id, id));
    if (affectedRows === 0)
      throw new NotFoundError(`filter option ${id} not found`);

    return c.body(null, 204);
  })
  .get('/:id/subject', getSubjectDoc, async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`GET /api/filter-option/${id}/subject`);

    const [found] = await db
      .select()
      .from(filterOptionTable)
      .where(eq(filterOptionTable.id, id));
    if (found === undefined)
      throw new NotFoundError(`filter option ${id} not found`);

    const links = await db
      .select({ subjectId: filterSubjectOptionTable.subjectId })
      .from(filterSubjectOptionTable)
      .where(eq(filterSubjectOptionTable.optionId, id));

    return c.json({
      subjectIds: links.map((l) => l.subjectId),
    } satisfies z.infer<typeof filterOptionSubjectResponseSchema>);
  })
  .put(
    '/:id/subject',
    putSubjectDoc,
    zValidator('json', filterOptionSubjectBodySchema),
    async (c) => {
      const db = c.get('db');
      const id = Number(c.req.param('id'));
      const { subjectIds } = c.req.valid('json');
      console.log(
        `PUT /api/filter-option/${id}/subject subjectIds=${subjectIds.join(',')}`
      );

      const [found] = await db
        .select()
        .from(filterOptionTable)
        .where(eq(filterOptionTable.id, id));
      if (found === undefined)
        throw new NotFoundError(`filter option ${id} not found`);

      // Full-set replace: simplest correct semantics for a multi-select
      // "these are the subjects now" save, and cheap at this table size.
      await db
        .delete(filterSubjectOptionTable)
        .where(eq(filterSubjectOptionTable.optionId, id));
      if (subjectIds.length > 0)
        await db
          .insert(filterSubjectOptionTable)
          .values(
            subjectIds.map((subjectId) => ({ subjectId, optionId: id }))
          );

      const links = await db
        .select({ subjectId: filterSubjectOptionTable.subjectId })
        .from(filterSubjectOptionTable)
        .where(eq(filterSubjectOptionTable.optionId, id));

      return c.json({
        subjectIds: links.map((l) => l.subjectId),
      } satisfies z.infer<typeof filterOptionSubjectResponseSchema>);
    }
  );
