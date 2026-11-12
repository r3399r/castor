import 'zod-openapi/extend';
import { zValidator } from '@hono/zod-validator';
import { asc, count, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import {
  categoryTable,
  filterDimensionTable,
  filterOptionTable,
  filterSubjectOptionTable,
  subjectCategoryTable,
  subjectTable,
} from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT, paginationSchema } from 'src/lib/paginator';
import { TransactionEnv } from 'src/middleware/transaction';
import { NotFoundError } from 'src/model/error';

export const postCategorySchema = z.object({
  name: z.string().min(1),
});

const CATEGORY_SORT_COLUMNS = {
  id: categoryTable.id,
  name: categoryTable.name,
};

export const categoryListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sort: z.enum(['id', 'name']).optional().default('id'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

/**
 * A category as this API reports it.
 *
 * A schema rather than `db.select()` reaching the client unexamined:
 * it is the single description of the response, the handlers' returns
 * are checked against it, and the OpenAPI document is generated from
 * it. See "The OpenAPI document" in AGENTS.md.
 */
export const categorySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  createdAt: z.string().nullable().describe('ISO 8601'),
}).openapi({ ref: 'Category' });

/**
 * Serialises a category row.
 *
 * `createdAt` is converted here rather than left to `c.json`: the column
 * is a Date, every type in the repo calls this field a string, and
 * JSON.stringify happening to agree is not a contract. The bytes on the
 * wire are identical.
 *
 * Field by field, not a spread, so a column added to `category` cannot
 * reach a client without being described first.
 */
const toCategoryDto = (row: {
  id: number;
  name: string;
  createdAt: Date | null;
}): z.infer<typeof categorySchema> => ({
  id: row.id,
  name: row.name,
  createdAt: row.createdAt?.toISOString() ?? null,
});

export const getCategoryListResponseSchema = z.object({
  data: z.array(categorySchema),
  paginate: paginationSchema,
});

const categorySubjectSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  sortOrder: z.number().int(),
});

const categoryFilterOptionSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  parentId: z
    .number()
    .int()
    .nullable()
    .describe('The option this one hangs under, or null for a top-level option'),
  subjectIds: z.array(z.number().int()).describe('Subjects this option selects'),
});

export const getCategorySubjectResponseSchema = z.object({
  subjects: z.array(categorySubjectSchema),
  filterDimensions: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      sortOrder: z.number().int(),
      options: z.array(categoryFilterOptionSchema),
    })
  ),
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
  summary: 'List categories',
  description:
    'Reads here need no credentials: `adminAuth` gates POST/PUT/DELETE only. Paginated, sortable by id or name.',
  tags: ['category'],
  responses: {
    200: {
      description: 'One page of categories',
      content: { 'application/json': { schema: resolver(getCategoryListResponseSchema) } },
    },
    400: { description: 'limit beyond the cap, or a malformed sort or order' },
  },
});

const getDoc = describeRoute({
  summary: 'Read one category',
  description: 'Reads here need no credentials: `adminAuth` gates POST/PUT/DELETE only.',
  tags: ['category'],
  responses: {
    200: {
      description: 'The category',
      content: { 'application/json': { schema: resolver(categorySchema) } },
    },
    404: { description: 'No such category' },
  },
});

const createDoc = describeRoute({
  summary: 'Create a category',
  description: 'Admin only.',
  tags: ['category'],
  responses: {
    201: {
      description: 'The category as saved',
      content: { 'application/json': { schema: resolver(categorySchema) } },
    },
    400: { description: 'An empty name' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
  },
});

const updateDoc = describeRoute({
  summary: 'Rename a category',
  description: 'Admin only.',
  tags: ['category'],
  responses: {
    200: {
      description: 'The category as saved',
      content: { 'application/json': { schema: resolver(categorySchema) } },
    },
    400: { description: 'An empty name' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
    404: { description: 'No such category' },
  },
});

const deleteDoc = describeRoute({
  summary: 'Delete a category',
  description:
    "Admin only. Clears the category's subject links first, so a category still linked to a subject can be deleted; the subjects themselves are left alone.",
  tags: ['category'],
  responses: {
    204: { description: 'Deleted' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
    404: { description: 'No such category' },
  },
});

const subjectDoc = describeRoute({
  summary: "A category's subjects and its filter surface",
  description:
    'Reads here need no credentials: `adminAuth` gates POST/PUT/DELETE only. Both lists come in one response, because the practice-page filter flow needs both the moment a category is picked. Unpaginated: neither list grows anywhere near pagination territory.',
  tags: ['category'],
  responses: {
    200: {
      description: 'The subjects, and the filter dimensions with their options',
      content: { 'application/json': { schema: resolver(getCategorySubjectResponseSchema) } },
    },
    404: { description: 'No such category' },
  },
});

export const category = new Hono<TransactionEnv>()
  .get('/', listDoc, zValidator('query', categoryListQuerySchema), async (c) => {
    const { limit, offset, sort, order } = c.req.valid('query');
    console.log(
      `GET /api/category limit=${limit} offset=${offset} sort=${sort} order=${order}`
    );
    const db = c.get('db');

    const [{ total }] = await db.select({ total: count() }).from(categoryTable);
    const sortColumn = CATEGORY_SORT_COLUMNS[sort];
    const data = await db
      .select()
      .from(categoryTable)
      .orderBy(order === 'desc' ? desc(sortColumn) : asc(sortColumn))
      .limit(limit)
      .offset(offset);

    return c.json({
      data: data.map(toCategoryDto),
      paginate: genPagination(total, limit, offset),
    } satisfies z.infer<typeof getCategoryListResponseSchema>);
  })
  .get('/:id', getDoc, async (c) => {
    const id = c.req.param('id');
    console.log(`GET /api/category/${id}`);
    const [found] = await c
      .get('db')
      .select()
      .from(categoryTable)
      .where(eq(categoryTable.id, Number(id)));
    if (found === undefined)
      throw new NotFoundError(`category ${id} not found`);

    return c.json(toCategoryDto(found) satisfies z.infer<typeof categorySchema>);
  })
  .post('/', createDoc, zValidator('json', postCategorySchema), async (c) => {
    const { name } = c.req.valid('json');
    console.log(`POST /api/category name=${name}`);
    const db = c.get('db');

    const [{ insertId }] = await db
      .insert(categoryTable)
      .values({ name, createdAt: new Date() });
    const [saved] = await db
      .select()
      .from(categoryTable)
      .where(eq(categoryTable.id, insertId));

    return c.json(toCategoryDto(saved) satisfies z.infer<typeof categorySchema>, 201);
  })
  .put('/:id', updateDoc, zValidator('json', postCategorySchema), async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    const { name } = c.req.valid('json');
    console.log(`PUT /api/category/${id} name=${name}`);

    const [{ affectedRows }] = await db
      .update(categoryTable)
      .set({ name })
      .where(eq(categoryTable.id, id));
    if (affectedRows === 0)
      throw new NotFoundError(`category ${id} not found`);

    const [updated] = await db
      .select()
      .from(categoryTable)
      .where(eq(categoryTable.id, id));

    return c.json(toCategoryDto(updated) satisfies z.infer<typeof categorySchema>);
  })
  .delete('/:id', deleteDoc, async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`DELETE /api/category/${id}`);

    // Clear subject_category links first -- the FK would otherwise reject
    // deleting a category that any subject is still linked to.
    await db
      .delete(subjectCategoryTable)
      .where(eq(subjectCategoryTable.categoryId, id));
    const [{ affectedRows }] = await db
      .delete(categoryTable)
      .where(eq(categoryTable.id, id));
    if (affectedRows === 0)
      throw new NotFoundError(`category ${id} not found`);

    return c.body(null, 204);
  })
  .get('/:id/subject', subjectDoc, async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`GET /api/category/${id}/subject`);

    const [found] = await db.select().from(categoryTable).where(eq(categoryTable.id, id));
    if (found === undefined) throw new NotFoundError(`category ${id} not found`);

    // Bundled together (subjects + filterDimensions) since the
    // practice-page filter flow always needs both the moment a category
    // is picked -- one request instead of two. Read-only, unpaginated --
    // neither a category's subject list nor its filter surface grows
    // anywhere near pagination territory.
    const subjects = await db
      .select({
        id: subjectTable.id,
        name: subjectTable.name,
        sortOrder: subjectTable.sortOrder,
      })
      .from(subjectTable)
      .innerJoin(subjectCategoryTable, eq(subjectCategoryTable.subjectId, subjectTable.id))
      .where(eq(subjectCategoryTable.categoryId, id))
      .orderBy(asc(subjectTable.sortOrder));

    // Three flat queries (dimensions -> their options -> those options'
    // subject links) instead of the N+1 that composing this client-side
    // from /api/filter-option/:id/subject per option would need.
    const dimensions = await db
      .select()
      .from(filterDimensionTable)
      .where(eq(filterDimensionTable.categoryId, id))
      .orderBy(asc(filterDimensionTable.sortOrder));
    const dimensionIds = dimensions.map((d) => d.id);

    const options =
      dimensionIds.length > 0
        ? await db
            .select()
            .from(filterOptionTable)
            .where(inArray(filterOptionTable.dimensionId, dimensionIds))
        : [];
    const optionIds = options.map((o) => o.id);

    const subjectLinks =
      optionIds.length > 0
        ? await db
            .select()
            .from(filterSubjectOptionTable)
            .where(inArray(filterSubjectOptionTable.optionId, optionIds))
        : [];
    const subjectIdsByOption = new Map<number, number[]>();
    for (const link of subjectLinks) {
      const list = subjectIdsByOption.get(link.optionId) ?? [];
      list.push(link.subjectId);
      subjectIdsByOption.set(link.optionId, list);
    }

    const optionsByDimension = new Map<number, typeof options>();
    for (const option of options) {
      const list = optionsByDimension.get(option.dimensionId) ?? [];
      list.push(option);
      optionsByDimension.set(option.dimensionId, list);
    }

    return c.json({
      subjects,
      filterDimensions: dimensions.map((dim) => ({
        id: dim.id,
        name: dim.name,
        sortOrder: dim.sortOrder,
        options: (optionsByDimension.get(dim.id) ?? []).map((opt) => ({
          id: opt.id,
          name: opt.name,
          parentId: opt.parentId,
          subjectIds: subjectIdsByOption.get(opt.id) ?? [],
        })),
      })),
    } satisfies z.infer<typeof getCategorySubjectResponseSchema>);
  });
