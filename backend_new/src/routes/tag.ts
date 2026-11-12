import 'zod-openapi/extend';
import { zValidator } from '@hono/zod-validator';
import { asc, count, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { subjectTable, tagTable } from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT, paginationSchema } from 'src/lib/paginator';
import { TransactionEnv } from 'src/middleware/transaction';
import { NotFoundError } from 'src/model/error';

export const tagBodySchema = z.object({
  name: z.string().min(1),
  subjectId: z.number().int().positive(),
});

// "subject" sorts by the linked subject's name -- requires a join purely
// for ordering; the response shape stays {id, name, subjectId, createdAt}
// since the admin UI already resolves subject display info from its own
// separately-fetched subject list.
const TAG_SORT_COLUMNS = {
  id: tagTable.id,
  name: tagTable.name,
  subject: subjectTable.name,
};

export const tagListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sort: z.enum(['id', 'name', 'subject']).optional().default('id'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

/**
 * A tag as this API reports it.
 *
 * A schema rather than `db.select()` reaching the client unexamined: it
 * is the single description of the response, the handlers' returns are
 * checked against it, and the OpenAPI document is generated from it.
 * See "The OpenAPI document" in AGENTS.md.
 */
export const tagSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  subjectId: z.number().int(),
  createdAt: z.string().nullable().describe('ISO 8601'),
}).openapi({ ref: 'Tag' });

/**
 * Serialises a tag row.
 *
 * `createdAt` is converted here rather than left to `c.json`: the column
 * is a Date, every type in the repo calls this field a string, and
 * JSON.stringify happening to agree is not a contract. Field by field,
 * not a spread, so a column added to `tag` cannot reach a client without
 * being described first -- `satisfies` would not catch that on its own,
 * since a row with extra properties is still assignable.
 */
const toTagDto = (row: {
  id: number;
  name: string;
  subjectId: number;
  createdAt: Date | null;
}): z.infer<typeof tagSchema> => ({
  id: row.id,
  name: row.name,
  subjectId: row.subjectId,
  createdAt: row.createdAt?.toISOString() ?? null,
});

export const getTagListResponseSchema = z.object({
  data: z.array(tagSchema),
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
  summary: 'List tags',
  description:
    'Reads here need no credentials: `adminAuth` gates POST/PUT/DELETE only. Paginated, sortable by id, name or the subject name.',
  tags: ['tag'],
  responses: {
    200: {
      description: 'One page of tags',
      content: { 'application/json': { schema: resolver(getTagListResponseSchema) } },
    },
    400: { description: 'limit beyond the cap, or a malformed sort or order' },
  },
});

const getDoc = describeRoute({
  summary: 'Read one tag',
  description: 'Reads here need no credentials: `adminAuth` gates POST/PUT/DELETE only.',
  tags: ['tag'],
  responses: {
    200: {
      description: 'The tag',
      content: { 'application/json': { schema: resolver(tagSchema) } },
    },
    404: { description: 'No such tag' },
  },
});

const createDoc = describeRoute({
  summary: 'Create a tag',
  description: 'Admin only.',
  tags: ['tag'],
  responses: {
    201: {
      description: 'The tag as saved',
      content: { 'application/json': { schema: resolver(tagSchema) } },
    },
    400: { description: 'An empty name, or a missing or non-positive subjectId' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
  },
});

const updateDoc = describeRoute({
  summary: 'Update a tag',
  description: 'Admin only. Every field in the body is required -- this is a replace, not a patch.',
  tags: ['tag'],
  responses: {
    200: {
      description: 'The tag as saved',
      content: { 'application/json': { schema: resolver(tagSchema) } },
    },
    400: { description: 'An empty name, or a missing or non-positive subjectId' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
    404: { description: 'No such tag' },
  },
});

const deleteDoc = describeRoute({
  summary: 'Delete a tag',
  description: 'Admin only. Nothing is cleared first.',
  tags: ['tag'],
  responses: {
    204: { description: 'Deleted' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
    404: { description: 'No such tag' },
    500: {
      description:
        'Something still references it. The database rejects the delete rather than cascading -- see the handler -- and an unmapped driver error is a 500 today, where a 409 would be the honest answer.',
    },
  },
});

export const tag = new Hono<TransactionEnv>()
  .get('/', listDoc, zValidator('query', tagListQuerySchema), async (c) => {
    const { limit, offset, sort, order } = c.req.valid('query');
    console.log(
      `GET /api/tag limit=${limit} offset=${offset} sort=${sort} order=${order}`
    );
    const db = c.get('db');

    const [{ total }] = await db.select({ total: count() }).from(tagTable);
    const sortColumn = TAG_SORT_COLUMNS[sort];
    const data = await db
      .select({
        id: tagTable.id,
        name: tagTable.name,
        subjectId: tagTable.subjectId,
        createdAt: tagTable.createdAt,
      })
      .from(tagTable)
      .innerJoin(subjectTable, eq(subjectTable.id, tagTable.subjectId))
      .orderBy(order === 'desc' ? desc(sortColumn) : asc(sortColumn))
      .limit(limit)
      .offset(offset);

    return c.json({
      data: data.map(toTagDto),
      paginate: genPagination(total, limit, offset),
    } satisfies z.infer<typeof getTagListResponseSchema>);
  })
  .get('/:id', getDoc, async (c) => {
    const id = c.req.param('id');
    console.log(`GET /api/tag/${id}`);
    const [found] = await c
      .get('db')
      .select()
      .from(tagTable)
      .where(eq(tagTable.id, Number(id)));
    if (found === undefined) throw new NotFoundError(`tag ${id} not found`);

    return c.json(toTagDto(found) satisfies z.infer<typeof tagSchema>);
  })
  .post('/', createDoc, zValidator('json', tagBodySchema), async (c) => {
    const { name, subjectId } = c.req.valid('json');
    console.log(`POST /api/tag name=${name} subjectId=${subjectId}`);
    const db = c.get('db');

    const [{ insertId }] = await db
      .insert(tagTable)
      .values({ name, subjectId, createdAt: new Date() });
    const [saved] = await db
      .select()
      .from(tagTable)
      .where(eq(tagTable.id, insertId));

    return c.json(toTagDto(saved) satisfies z.infer<typeof tagSchema>, 201);
  })
  .put('/:id', updateDoc, zValidator('json', tagBodySchema), async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    const { name, subjectId } = c.req.valid('json');
    console.log(`PUT /api/tag/${id} name=${name} subjectId=${subjectId}`);

    const [{ affectedRows }] = await db
      .update(tagTable)
      .set({ name, subjectId })
      .where(eq(tagTable.id, id));
    if (affectedRows === 0) throw new NotFoundError(`tag ${id} not found`);

    const [updated] = await db
      .select()
      .from(tagTable)
      .where(eq(tagTable.id, id));

    return c.json(toTagDto(updated) satisfies z.infer<typeof tagSchema>);
  })
  .delete('/:id', deleteDoc, async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`DELETE /api/tag/${id}`);

    const [{ affectedRows }] = await db
      .delete(tagTable)
      .where(eq(tagTable.id, id));
    if (affectedRows === 0) throw new NotFoundError(`tag ${id} not found`);

    return c.body(null, 204);
  });
