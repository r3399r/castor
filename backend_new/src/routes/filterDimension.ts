import { zValidator } from '@hono/zod-validator';
import { asc, count, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { categoryTable, filterDimensionTable } from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT, paginationSchema } from 'src/lib/paginator';
import { TransactionEnv } from 'src/middleware/transaction';
import { NotFoundError } from 'src/model/error';

export const filterDimensionBodySchema = z.object({
  name: z.string().min(1),
  categoryId: z.number().int().positive(),
  sortOrder: z.number().int().min(0).max(255).optional().default(0),
});

// "category" sorts by the linked category's name -- requires a join purely
// for ordering; the response shape stays {id, name, categoryId, sortOrder}
// since the admin UI already resolves category display info from its own
// separately-fetched category list.
const FILTER_DIMENSION_SORT_COLUMNS = {
  id: filterDimensionTable.id,
  name: filterDimensionTable.name,
  sortOrder: filterDimensionTable.sortOrder,
  category: categoryTable.name,
};

export const filterDimensionListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sort: z.enum(['id', 'name', 'sortOrder', 'category']).optional().default('sortOrder'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

/**
 * A filter dimension as this API reports it.
 *
 * Four fields and no timestamp, because the table has none -- which is
 * worth stating, since every other row in this part of the schema
 * carries a `created_at`.
 *
 * Field by field in the DTO below, not a spread: `satisfies` alone would
 * not catch a column added to `filter_dimension` reaching a client,
 * since a row with extra properties is still assignable.
 */
export const filterDimensionSchema = z.object({
  id: z.number().int(),
  categoryId: z.number().int(),
  name: z.string(),
  sortOrder: z.number().int().describe('Ascending; the order the filter rows are shown in'),
});

const toFilterDimensionDto = (row: {
  id: number;
  categoryId: number;
  name: string;
  sortOrder: number;
}): z.infer<typeof filterDimensionSchema> => ({
  id: row.id,
  categoryId: row.categoryId,
  name: row.name,
  sortOrder: row.sortOrder,
});

export const getFilterDimensionListResponseSchema = z.object({
  data: z.array(filterDimensionSchema),
  paginate: paginationSchema,
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
  summary: 'List filter dimensions',
  description:
    'Reads here need no credentials: `adminAuth` gates POST/PUT/DELETE only. Paginated, sortable by id, name, sortOrder or the category name.',
  tags: ['filter-dimension'],
  responses: {
    200: {
      description: 'One page of filter dimensions',
      content: { 'application/json': { schema: resolver(getFilterDimensionListResponseSchema) } },
    },
    400: { description: 'limit beyond the cap, or a malformed sort or order' },
  },
});

const getDoc = describeRoute({
  summary: 'Read one filter dimension',
  description: 'Reads here need no credentials: `adminAuth` gates POST/PUT/DELETE only.',
  tags: ['filter-dimension'],
  responses: {
    200: {
      description: 'The filter dimension',
      content: { 'application/json': { schema: resolver(filterDimensionSchema) } },
    },
    404: { description: 'No such filter dimension' },
  },
});

const createDoc = describeRoute({
  summary: 'Create a filter dimension',
  description: 'Admin only.',
  tags: ['filter-dimension'],
  responses: {
    201: {
      description: 'The filter dimension as saved',
      content: { 'application/json': { schema: resolver(filterDimensionSchema) } },
    },
    400: { description: 'An empty name, a missing or non-positive categoryId, or a sortOrder outside 0-255' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
  },
});

const updateDoc = describeRoute({
  summary: 'Update a filter dimension',
  description: 'Admin only. Every field in the body is required -- this is a replace, not a patch.',
  tags: ['filter-dimension'],
  responses: {
    200: {
      description: 'The filter dimension as saved',
      content: { 'application/json': { schema: resolver(filterDimensionSchema) } },
    },
    400: { description: 'An empty name, a missing or non-positive categoryId, or a sortOrder outside 0-255' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
    404: { description: 'No such filter dimension' },
  },
});

const deleteDoc = describeRoute({
  summary: 'Delete a filter dimension',
  description:
    'Admin only. Nothing is cleared first: a filter option has a required dimension id, so a dimension that still has options under it is not deletable -- deliberately, rather than orphaning or destroying them.',
  tags: ['filter-dimension'],
  responses: {
    204: { description: 'Deleted' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
    404: { description: 'No such filter dimension' },
    500: {
      description:
        'Something still references it. The database rejects the delete rather than cascading -- see the handler -- and an unmapped driver error is a 500 today, where a 409 would be the honest answer.',
    },
  },
});

export const filterDimension = new Hono<TransactionEnv>()
  .get('/', listDoc, zValidator('query', filterDimensionListQuerySchema), async (c) => {
    const { limit, offset, sort, order } = c.req.valid('query');
    console.log(
      `GET /api/filter-dimension limit=${limit} offset=${offset} sort=${sort} order=${order}`
    );
    const db = c.get('db');

    const [{ total }] = await db
      .select({ total: count() })
      .from(filterDimensionTable);
    const sortColumn = FILTER_DIMENSION_SORT_COLUMNS[sort];
    const data = await db
      .select({
        id: filterDimensionTable.id,
        name: filterDimensionTable.name,
        categoryId: filterDimensionTable.categoryId,
        sortOrder: filterDimensionTable.sortOrder,
      })
      .from(filterDimensionTable)
      .innerJoin(
        categoryTable,
        eq(categoryTable.id, filterDimensionTable.categoryId)
      )
      .orderBy(order === 'desc' ? desc(sortColumn) : asc(sortColumn))
      .limit(limit)
      .offset(offset);

    return c.json({
      data: data.map(toFilterDimensionDto),
      paginate: genPagination(total, limit, offset),
    } satisfies z.infer<typeof getFilterDimensionListResponseSchema>);
  })
  .get('/:id', getDoc, async (c) => {
    const id = c.req.param('id');
    console.log(`GET /api/filter-dimension/${id}`);
    const [found] = await c
      .get('db')
      .select()
      .from(filterDimensionTable)
      .where(eq(filterDimensionTable.id, Number(id)));
    if (found === undefined)
      throw new NotFoundError(`filter dimension ${id} not found`);

    return c.json(toFilterDimensionDto(found) satisfies z.infer<typeof filterDimensionSchema>);
  })
  .post('/', createDoc, zValidator('json', filterDimensionBodySchema), async (c) => {
    const { name, categoryId, sortOrder } = c.req.valid('json');
    console.log(
      `POST /api/filter-dimension name=${name} categoryId=${categoryId} sortOrder=${sortOrder}`
    );
    const db = c.get('db');

    const [{ insertId }] = await db
      .insert(filterDimensionTable)
      .values({ name, categoryId, sortOrder });
    const [saved] = await db
      .select()
      .from(filterDimensionTable)
      .where(eq(filterDimensionTable.id, insertId));

    return c.json(toFilterDimensionDto(saved) satisfies z.infer<typeof filterDimensionSchema>, 201);
  })
  .put(
    '/:id',
    updateDoc,
    zValidator('json', filterDimensionBodySchema),
    async (c) => {
      const db = c.get('db');
      const id = Number(c.req.param('id'));
      const { name, categoryId, sortOrder } = c.req.valid('json');
      console.log(
        `PUT /api/filter-dimension/${id} name=${name} categoryId=${categoryId} sortOrder=${sortOrder}`
      );

      const [{ affectedRows }] = await db
        .update(filterDimensionTable)
        .set({ name, categoryId, sortOrder })
        .where(eq(filterDimensionTable.id, id));
      if (affectedRows === 0)
        throw new NotFoundError(`filter dimension ${id} not found`);

      const [updated] = await db
        .select()
        .from(filterDimensionTable)
        .where(eq(filterDimensionTable.id, id));

      return c.json(toFilterDimensionDto(updated) satisfies z.infer<typeof filterDimensionSchema>);
    }
  )
  .delete('/:id', deleteDoc, async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`DELETE /api/filter-dimension/${id}`);

    // No cascade for filter_option's required (NOT NULL) dimension_id --
    // same reasoning as tag/concept_group/concept's required parent FKs: a
    // dimension with options still under it should reject the delete
    // rather than silently orphan or destroy those options.
    const [{ affectedRows }] = await db
      .delete(filterDimensionTable)
      .where(eq(filterDimensionTable.id, id));
    if (affectedRows === 0)
      throw new NotFoundError(`filter dimension ${id} not found`);

    return c.body(null, 204);
  });
