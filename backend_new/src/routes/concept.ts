import { zValidator } from '@hono/zod-validator';
import { asc, count, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { conceptGroupTable, conceptTable } from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT, paginationSchema } from 'src/lib/paginator';
import { TransactionEnv } from 'src/middleware/transaction';
import { NotFoundError } from 'src/model/error';

// numberOfQuestions is populated elsewhere (counted as questions get
// added) -- not an admin-editable attribute, so it's deliberately absent
// here rather than merely optional.
export const conceptBodySchema = z.object({
  name: z.string().min(1),
  conceptGroupId: z.number().int().positive(),
});

// "conceptGroup" sorts by the linked concept group's name -- requires a
// join purely for ordering; the response shape stays
// {id, name, conceptGroupId, numberOfQuestions, createdAt} since the
// admin UI already resolves concept-group display info from its own
// separately-fetched list.
const CONCEPT_SORT_COLUMNS = {
  id: conceptTable.id,
  name: conceptTable.name,
  conceptGroup: conceptGroupTable.name,
  numberOfQuestions: conceptTable.numberOfQuestions,
};

export const conceptListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sort: z
    .enum(['id', 'name', 'conceptGroup', 'numberOfQuestions'])
    .optional()
    .default('id'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

/**
 * A concept as this API reports it.
 *
 * A schema rather than `db.select()` reaching the client unexamined: it
 * is the single description of the response, the handlers' returns are
 * checked against it, and the OpenAPI document is generated from it.
 * See "The OpenAPI document" in AGENTS.md.
 */
export const conceptSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  conceptGroupId: z.number().int(),
  numberOfQuestions: z
    .number()
    .int()
    .describe('Counted as questions are added; not editable through this API'),
  createdAt: z.string().nullable().describe('ISO 8601'),
});

/**
 * Serialises a concept row.
 *
 * `createdAt` is converted here rather than left to `c.json`: the column
 * is a Date, every type in the repo calls this field a string, and
 * JSON.stringify happening to agree is not a contract. Field by field,
 * not a spread, so a column added to `concept` cannot reach a client
 * without being described first -- `satisfies` would not catch that on
 * its own, since a row with extra properties is still assignable.
 */
const toConceptDto = (row: {
  id: number;
  name: string;
  conceptGroupId: number;
  numberOfQuestions: number;
  createdAt: Date | null;
}): z.infer<typeof conceptSchema> => ({
  id: row.id,
  name: row.name,
  conceptGroupId: row.conceptGroupId,
  numberOfQuestions: row.numberOfQuestions,
  createdAt: row.createdAt?.toISOString() ?? null,
});

export const getConceptListResponseSchema = z.object({
  data: z.array(conceptSchema),
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
  summary: 'List concepts',
  description:
    'Reads here need no credentials: `adminAuth` gates POST/PUT/DELETE only. Paginated, sortable by id, name, the concept group name or the question count.',
  tags: ['concept'],
  responses: {
    200: {
      description: 'One page of concepts',
      content: { 'application/json': { schema: resolver(getConceptListResponseSchema) } },
    },
    400: { description: 'limit beyond the cap, or a malformed sort or order' },
  },
});

const getDoc = describeRoute({
  summary: 'Read one concept',
  description: 'Reads here need no credentials: `adminAuth` gates POST/PUT/DELETE only.',
  tags: ['concept'],
  responses: {
    200: {
      description: 'The concept',
      content: { 'application/json': { schema: resolver(conceptSchema) } },
    },
    404: { description: 'No such concept' },
  },
});

const createDoc = describeRoute({
  summary: 'Create a concept',
  description: 'Admin only.',
  tags: ['concept'],
  responses: {
    201: {
      description: 'The concept as saved',
      content: { 'application/json': { schema: resolver(conceptSchema) } },
    },
    400: { description: 'An empty name, or a missing or non-positive conceptGroupId' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
  },
});

const updateDoc = describeRoute({
  summary: 'Update a concept',
  description: 'Admin only. Every field in the body is required -- this is a replace, not a patch.',
  tags: ['concept'],
  responses: {
    200: {
      description: 'The concept as saved',
      content: { 'application/json': { schema: resolver(conceptSchema) } },
    },
    400: { description: 'An empty name, or a missing or non-positive conceptGroupId' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
    404: { description: 'No such concept' },
  },
});

const deleteDoc = describeRoute({
  summary: 'Delete a concept',
  description: 'Admin only. Nothing is cleared first.',
  tags: ['concept'],
  responses: {
    204: { description: 'Deleted' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
    404: { description: 'No such concept' },
    500: {
      description:
        'Something still references it. The database rejects the delete rather than cascading -- see the handler -- and an unmapped driver error is a 500 today, where a 409 would be the honest answer.',
    },
  },
});

export const concept = new Hono<TransactionEnv>()
  .get('/', listDoc, zValidator('query', conceptListQuerySchema), async (c) => {
    const { limit, offset, sort, order } = c.req.valid('query');
    console.log(
      `GET /api/concept limit=${limit} offset=${offset} sort=${sort} order=${order}`
    );
    const db = c.get('db');

    const [{ total }] = await db.select({ total: count() }).from(conceptTable);
    const sortColumn = CONCEPT_SORT_COLUMNS[sort];
    const data = await db
      .select({
        id: conceptTable.id,
        name: conceptTable.name,
        conceptGroupId: conceptTable.conceptGroupId,
        numberOfQuestions: conceptTable.numberOfQuestions,
        createdAt: conceptTable.createdAt,
      })
      .from(conceptTable)
      .innerJoin(
        conceptGroupTable,
        eq(conceptGroupTable.id, conceptTable.conceptGroupId)
      )
      .orderBy(order === 'desc' ? desc(sortColumn) : asc(sortColumn))
      .limit(limit)
      .offset(offset);

    return c.json({
      data: data.map(toConceptDto),
      paginate: genPagination(total, limit, offset),
    } satisfies z.infer<typeof getConceptListResponseSchema>);
  })
  .get('/:id', getDoc, async (c) => {
    const id = c.req.param('id');
    console.log(`GET /api/concept/${id}`);
    const [found] = await c
      .get('db')
      .select()
      .from(conceptTable)
      .where(eq(conceptTable.id, Number(id)));
    if (found === undefined) throw new NotFoundError(`concept ${id} not found`);

    return c.json(toConceptDto(found) satisfies z.infer<typeof conceptSchema>);
  })
  .post('/', createDoc, zValidator('json', conceptBodySchema), async (c) => {
    const { name, conceptGroupId } = c.req.valid('json');
    console.log(`POST /api/concept name=${name} conceptGroupId=${conceptGroupId}`);
    const db = c.get('db');

    const [{ insertId }] = await db
      .insert(conceptTable)
      .values({ name, conceptGroupId, createdAt: new Date() });
    const [saved] = await db
      .select()
      .from(conceptTable)
      .where(eq(conceptTable.id, insertId));

    return c.json(toConceptDto(saved) satisfies z.infer<typeof conceptSchema>, 201);
  })
  .put('/:id', updateDoc, zValidator('json', conceptBodySchema), async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    const { name, conceptGroupId } = c.req.valid('json');
    console.log(
      `PUT /api/concept/${id} name=${name} conceptGroupId=${conceptGroupId}`
    );

    const [{ affectedRows }] = await db
      .update(conceptTable)
      .set({ name, conceptGroupId })
      .where(eq(conceptTable.id, id));
    if (affectedRows === 0) throw new NotFoundError(`concept ${id} not found`);

    const [updated] = await db
      .select()
      .from(conceptTable)
      .where(eq(conceptTable.id, id));

    return c.json(toConceptDto(updated) satisfies z.infer<typeof conceptSchema>);
  })
  .delete('/:id', deleteDoc, async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`DELETE /api/concept/${id}`);

    const [{ affectedRows }] = await db
      .delete(conceptTable)
      .where(eq(conceptTable.id, id));
    if (affectedRows === 0) throw new NotFoundError(`concept ${id} not found`);

    return c.body(null, 204);
  });
