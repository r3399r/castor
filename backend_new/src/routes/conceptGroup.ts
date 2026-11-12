import 'zod-openapi/extend';
import { zValidator } from '@hono/zod-validator';
import { asc, count, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { conceptGroupTable, subjectTable } from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT, paginationSchema } from 'src/lib/paginator';
import { TransactionEnv } from 'src/middleware/transaction';
import { NotFoundError } from 'src/model/error';

export const conceptGroupBodySchema = z.object({
  name: z.string().min(1),
  subjectId: z.number().int().positive(),
});

// "subject" sorts by the linked subject's name -- requires a join purely
// for ordering; the response shape stays {id, name, subjectId, createdAt}
// since the admin UI already resolves subject display info from its own
// separately-fetched subject list.
const CONCEPT_GROUP_SORT_COLUMNS = {
  id: conceptGroupTable.id,
  name: conceptGroupTable.name,
  subject: subjectTable.name,
};

export const conceptGroupListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sort: z.enum(['id', 'name', 'subject']).optional().default('id'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

/**
 * A concept group as this API reports it.
 *
 * A schema rather than `db.select()` reaching the client unexamined: it
 * is the single description of the response, the handlers' returns are
 * checked against it, and the OpenAPI document is generated from it.
 * See "The OpenAPI document" in AGENTS.md.
 */
export const conceptGroupSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  subjectId: z.number().int(),
  createdAt: z.string().nullable().describe('ISO 8601'),
}).openapi({ ref: 'ConceptGroup' });

/**
 * Serialises a concept group row.
 *
 * `createdAt` is converted here rather than left to `c.json`: the column
 * is a Date, every type in the repo calls this field a string, and
 * JSON.stringify happening to agree is not a contract. Field by field,
 * not a spread, so a column added to `concept_group` cannot reach a
 * client without being described first -- `satisfies` would not catch
 * that on its own, since a row with extra properties is still
 * assignable.
 */
const toConceptGroupDto = (row: {
  id: number;
  name: string;
  subjectId: number;
  createdAt: Date | null;
}): z.infer<typeof conceptGroupSchema> => ({
  id: row.id,
  name: row.name,
  subjectId: row.subjectId,
  createdAt: row.createdAt?.toISOString() ?? null,
});

export const getConceptGroupListResponseSchema = z.object({
  data: z.array(conceptGroupSchema),
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
  summary: 'List concept groups',
  description:
    'Reads here need no credentials: `adminAuth` gates POST/PUT/DELETE only. Paginated, sortable by id, name or the subject name.',
  tags: ['concept-group'],
  responses: {
    200: {
      description: 'One page of concept groups',
      content: { 'application/json': { schema: resolver(getConceptGroupListResponseSchema) } },
    },
    400: { description: 'limit beyond the cap, or a malformed sort or order' },
  },
});

const getDoc = describeRoute({
  summary: 'Read one concept group',
  description: 'Reads here need no credentials: `adminAuth` gates POST/PUT/DELETE only.',
  tags: ['concept-group'],
  responses: {
    200: {
      description: 'The concept group',
      content: { 'application/json': { schema: resolver(conceptGroupSchema) } },
    },
    404: { description: 'No such concept group' },
  },
});

const createDoc = describeRoute({
  summary: 'Create a concept group',
  description: 'Admin only.',
  tags: ['concept-group'],
  responses: {
    201: {
      description: 'The concept group as saved',
      content: { 'application/json': { schema: resolver(conceptGroupSchema) } },
    },
    400: { description: 'An empty name, or a missing or non-positive subjectId' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
  },
});

const updateDoc = describeRoute({
  summary: 'Update a concept group',
  description: 'Admin only. Every field in the body is required -- this is a replace, not a patch.',
  tags: ['concept-group'],
  responses: {
    200: {
      description: 'The concept group as saved',
      content: { 'application/json': { schema: resolver(conceptGroupSchema) } },
    },
    400: { description: 'An empty name, or a missing or non-positive subjectId' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
    404: { description: 'No such concept group' },
  },
});

const deleteDoc = describeRoute({
  summary: 'Delete a concept group',
  description:
    'Admin only. Nothing is cleared first: the concepts under a group have a required group id, so a group that still holds any is not deletable -- deliberately, rather than orphaning or destroying them.',
  tags: ['concept-group'],
  responses: {
    204: { description: 'Deleted' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
    404: { description: 'No such concept group' },
    500: {
      description:
        'Something still references it. The database rejects the delete rather than cascading -- see the handler -- and an unmapped driver error is a 500 today, where a 409 would be the honest answer.',
    },
  },
});

export const conceptGroup = new Hono<TransactionEnv>()
  .get('/', listDoc, zValidator('query', conceptGroupListQuerySchema), async (c) => {
    const { limit, offset, sort, order } = c.req.valid('query');
    console.log(
      `GET /api/concept-group limit=${limit} offset=${offset} sort=${sort} order=${order}`
    );
    const db = c.get('db');

    const [{ total }] = await db
      .select({ total: count() })
      .from(conceptGroupTable);
    const sortColumn = CONCEPT_GROUP_SORT_COLUMNS[sort];
    const data = await db
      .select({
        id: conceptGroupTable.id,
        name: conceptGroupTable.name,
        subjectId: conceptGroupTable.subjectId,
        createdAt: conceptGroupTable.createdAt,
      })
      .from(conceptGroupTable)
      .innerJoin(subjectTable, eq(subjectTable.id, conceptGroupTable.subjectId))
      .orderBy(order === 'desc' ? desc(sortColumn) : asc(sortColumn))
      .limit(limit)
      .offset(offset);

    return c.json({
      data: data.map(toConceptGroupDto),
      paginate: genPagination(total, limit, offset),
    } satisfies z.infer<typeof getConceptGroupListResponseSchema>);
  })
  .get('/:id', getDoc, async (c) => {
    const id = c.req.param('id');
    console.log(`GET /api/concept-group/${id}`);
    const [found] = await c
      .get('db')
      .select()
      .from(conceptGroupTable)
      .where(eq(conceptGroupTable.id, Number(id)));
    if (found === undefined)
      throw new NotFoundError(`concept group ${id} not found`);

    return c.json(toConceptGroupDto(found) satisfies z.infer<typeof conceptGroupSchema>);
  })
  .post('/', createDoc, zValidator('json', conceptGroupBodySchema), async (c) => {
    const { name, subjectId } = c.req.valid('json');
    console.log(`POST /api/concept-group name=${name} subjectId=${subjectId}`);
    const db = c.get('db');

    const [{ insertId }] = await db
      .insert(conceptGroupTable)
      .values({ name, subjectId, createdAt: new Date() });
    const [saved] = await db
      .select()
      .from(conceptGroupTable)
      .where(eq(conceptGroupTable.id, insertId));

    return c.json(toConceptGroupDto(saved) satisfies z.infer<typeof conceptGroupSchema>, 201);
  })
  .put('/:id', updateDoc, zValidator('json', conceptGroupBodySchema), async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    const { name, subjectId } = c.req.valid('json');
    console.log(
      `PUT /api/concept-group/${id} name=${name} subjectId=${subjectId}`
    );

    const [{ affectedRows }] = await db
      .update(conceptGroupTable)
      .set({ name, subjectId })
      .where(eq(conceptGroupTable.id, id));
    if (affectedRows === 0)
      throw new NotFoundError(`concept group ${id} not found`);

    const [updated] = await db
      .select()
      .from(conceptGroupTable)
      .where(eq(conceptGroupTable.id, id));

    return c.json(toConceptGroupDto(updated) satisfies z.infer<typeof conceptGroupSchema>);
  })
  .delete('/:id', deleteDoc, async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`DELETE /api/concept-group/${id}`);

    const [{ affectedRows }] = await db
      .delete(conceptGroupTable)
      .where(eq(conceptGroupTable.id, id));
    if (affectedRows === 0)
      throw new NotFoundError(`concept group ${id} not found`);

    return c.body(null, 204);
  });
