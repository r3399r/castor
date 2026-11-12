import { zValidator } from '@hono/zod-validator';
import { asc, count, desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { examSubjectTable, examTable, subjectTable } from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT, paginationSchema } from 'src/lib/paginator';
import { TransactionEnv } from 'src/middleware/transaction';
import { NotFoundError } from 'src/model/error';

export const examBodySchema = z.object({
  name: z.string().min(1),
});

export const examSubjectBodySchema = z.object({
  subjectIds: z.array(z.number().int().positive()),
});

// Reused in both the SELECT list and ORDER BY below -- same JS reference,
// so the identical GROUP_CONCAT expression is emitted in both places,
// which MySQL requires for ordering by an aggregate in a grouped query.
const subjectsExpr = sql<string | null>`GROUP_CONCAT(
  ${subjectTable.name} ORDER BY ${subjectTable.name} SEPARATOR ', '
)`;

const EXAM_SORT_COLUMNS = {
  id: examTable.id,
  name: examTable.name,
  subjects: subjectsExpr,
};

export const examListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sort: z.enum(['id', 'name', 'subjects']).optional().default('id'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

/**
 * An exam as this API reports it.
 *
 * A schema rather than `db.select()` reaching the client unexamined:
 * it is the single description of the response, the handlers' returns
 * are checked against it, and the OpenAPI document is generated from
 * it. See "The OpenAPI document" in AGENTS.md.
 */
export const examSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  createdAt: z.string().nullable().describe('ISO 8601'),
});

/**
 * Serialises an exam row.
 *
 * `createdAt` is converted here rather than left to `c.json`: the column
 * is a Date, every type in the repo calls this field a string, and
 * JSON.stringify happening to agree is not a contract. Field by field,
 * not a spread, so a column added to `exam` cannot reach a client
 * without being described first.
 */
const toExamDto = (row: {
  id: number;
  name: string;
  createdAt: Date | null;
}): z.infer<typeof examSchema> => ({
  id: row.id,
  name: row.name,
  createdAt: row.createdAt?.toISOString() ?? null,
});

export const getExamListResponseSchema = z.object({
  data: z.array(
    examSchema.extend({
      subjects: z
        .string()
        .nullable()
        .describe(
          "The exam's subject names, comma-separated, or null when it has none. A read-only summary for the admin list -- subjects are edited through /api/exam/{id}/subject."
        ),
    })
  ),
  paginate: paginationSchema,
});

export const examSubjectResponseSchema = z.object({
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
 * checks POST/PUT/DELETE only, so every read in this group answers
 * without any credentials while every write is admin-only. That is
 * deliberate -- see the middleware's own comment: this is catalog
 * content, not anything that reads as PII -- and it is the first thing
 * whoever writes a client needs to know.
 */
const listDoc = describeRoute({
  summary: 'List exams',
  description: 'Reads here need no credentials: `adminAuth` gates POST/PUT/DELETE only. Paginated, sortable by id, name or subject names.',
  tags: ['exam'],
  responses: {
    200: {
      description: 'One page of exams',
      content: { 'application/json': { schema: resolver(getExamListResponseSchema) } },
    },
    400: { description: 'limit beyond the cap, or a malformed sort or order' },
  },
});

const getDoc = describeRoute({
  summary: 'Read one exam',
  description:
    'Reads here need no credentials: `adminAuth` gates POST/PUT/DELETE only. The exam alone; its subjects are GET /api/exam/{id}/subject.',
  tags: ['exam'],
  responses: {
    200: {
      description: 'The exam',
      content: { 'application/json': { schema: resolver(examSchema) } },
    },
    404: { description: 'No such exam' },
  },
});

const createDoc = describeRoute({
  summary: 'Create an exam',
  description: 'Admin only. No subjects are attached; that is a separate save.',
  tags: ['exam'],
  responses: {
    201: {
      description: 'The exam as saved',
      content: { 'application/json': { schema: resolver(examSchema) } },
    },
    400: { description: 'An empty name' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
  },
});

const updateDoc = describeRoute({
  summary: 'Rename an exam',
  description: 'Admin only.',
  tags: ['exam'],
  responses: {
    200: {
      description: 'The exam as saved',
      content: { 'application/json': { schema: resolver(examSchema) } },
    },
    400: { description: 'An empty name' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
    404: { description: 'No such exam' },
  },
});

const deleteDoc = describeRoute({
  summary: 'Delete an exam',
  description:
    "Admin only. Clears the exam's subject links first, so one that is still linked can be deleted; the subjects themselves are left alone.",
  tags: ['exam'],
  responses: {
    204: { description: 'Deleted' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
    404: { description: 'No such exam' },
  },
});

const getSubjectDoc = describeRoute({
  summary: 'The subjects an exam covers',
  description: 'Reads here need no credentials: `adminAuth` gates POST/PUT/DELETE only. Ids alone: the names come from GET /api/subject.',
  tags: ['exam'],
  responses: {
    200: {
      description: 'The subject ids',
      content: { 'application/json': { schema: resolver(examSubjectResponseSchema) } },
    },
    404: { description: 'No such exam' },
  },
});

const putSubjectDoc = describeRoute({
  summary: 'Replace the subjects an exam covers',
  description:
    'Admin only. A full-set replace, not a merge: the ids sent are the subjects afterwards, and an empty array leaves it covering none.',
  tags: ['exam'],
  responses: {
    200: {
      description: 'The subject ids as saved',
      content: { 'application/json': { schema: resolver(examSubjectResponseSchema) } },
    },
    400: { description: 'subjectIds missing, or not an array of positive integers' },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
    404: { description: 'No such exam' },
  },
});

export const exam = new Hono<TransactionEnv>()
  .get('/', listDoc, zValidator('query', examListQuerySchema), async (c) => {
    const { limit, offset, sort, order } = c.req.valid('query');
    console.log(
      `GET /api/exam limit=${limit} offset=${offset} sort=${sort} order=${order}`
    );
    const db = c.get('db');

    const [{ total }] = await db.select({ total: count() }).from(examTable);
    const sortColumn = EXAM_SORT_COLUMNS[sort];
    const data = await db
      .select({
        id: examTable.id,
        name: examTable.name,
        createdAt: examTable.createdAt,
        // Read-only summary for the admin list -- subjects aren't
        // editable through this endpoint, so a formatted CSV string is
        // all the UI needs (no reason to ship structured subject data
        // the client can't act on).
        subjects: subjectsExpr,
      })
      .from(examTable)
      .leftJoin(examSubjectTable, eq(examSubjectTable.examId, examTable.id))
      .leftJoin(subjectTable, eq(subjectTable.id, examSubjectTable.subjectId))
      .groupBy(examTable.id)
      .orderBy(order === 'desc' ? desc(sortColumn) : asc(sortColumn))
      .limit(limit)
      .offset(offset);

    return c.json({
      // `subjects` is put back because it is this endpoint's own
      // aggregate rather than a column of exam.
      data: data.map(({ subjects, ...row }) => ({ ...toExamDto(row), subjects })),
      paginate: genPagination(total, limit, offset),
    } satisfies z.infer<typeof getExamListResponseSchema>);
  })
  .get('/:id', getDoc, async (c) => {
    const id = c.req.param('id');
    console.log(`GET /api/exam/${id}`);
    const [found] = await c
      .get('db')
      .select()
      .from(examTable)
      .where(eq(examTable.id, Number(id)));
    if (found === undefined) throw new NotFoundError(`exam ${id} not found`);

    return c.json(toExamDto(found) satisfies z.infer<typeof examSchema>);
  })
  .post('/', createDoc, zValidator('json', examBodySchema), async (c) => {
    const { name } = c.req.valid('json');
    console.log(`POST /api/exam name=${name}`);
    const db = c.get('db');

    const [{ insertId }] = await db
      .insert(examTable)
      .values({ name, createdAt: new Date() });
    const [saved] = await db
      .select()
      .from(examTable)
      .where(eq(examTable.id, insertId));

    return c.json(toExamDto(saved) satisfies z.infer<typeof examSchema>, 201);
  })
  .put('/:id', updateDoc, zValidator('json', examBodySchema), async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    const { name } = c.req.valid('json');
    console.log(`PUT /api/exam/${id} name=${name}`);

    const [{ affectedRows }] = await db
      .update(examTable)
      .set({ name })
      .where(eq(examTable.id, id));
    if (affectedRows === 0) throw new NotFoundError(`exam ${id} not found`);

    const [updated] = await db
      .select()
      .from(examTable)
      .where(eq(examTable.id, id));

    return c.json(toExamDto(updated) satisfies z.infer<typeof examSchema>);
  })
  .delete('/:id', deleteDoc, async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`DELETE /api/exam/${id}`);

    // Clear exam_subject links first -- the FK would otherwise reject
    // deleting an exam that still has linked subjects.
    await db.delete(examSubjectTable).where(eq(examSubjectTable.examId, id));
    const [{ affectedRows }] = await db
      .delete(examTable)
      .where(eq(examTable.id, id));
    if (affectedRows === 0) throw new NotFoundError(`exam ${id} not found`);

    return c.body(null, 204);
  })
  .get('/:id/subject', getSubjectDoc, async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`GET /api/exam/${id}/subject`);

    const [found] = await db
      .select()
      .from(examTable)
      .where(eq(examTable.id, id));
    if (found === undefined) throw new NotFoundError(`exam ${id} not found`);

    const links = await db
      .select({ subjectId: examSubjectTable.subjectId })
      .from(examSubjectTable)
      .where(eq(examSubjectTable.examId, id));

    return c.json({
      subjectIds: links.map((l) => l.subjectId),
    } satisfies z.infer<typeof examSubjectResponseSchema>);
  })
  .put(
    '/:id/subject',
    putSubjectDoc,
    zValidator('json', examSubjectBodySchema),
    async (c) => {
      const db = c.get('db');
      const id = Number(c.req.param('id'));
      const { subjectIds } = c.req.valid('json');
      console.log(
        `PUT /api/exam/${id}/subject subjectIds=${subjectIds.join(',')}`
      );

      const [found] = await db
        .select()
        .from(examTable)
        .where(eq(examTable.id, id));
      if (found === undefined) throw new NotFoundError(`exam ${id} not found`);

      // Full-set replace: simplest correct semantics for a multi-select
      // "these are the subjects now" save, and cheap at this table size.
      await db
        .delete(examSubjectTable)
        .where(eq(examSubjectTable.examId, id));
      if (subjectIds.length > 0)
        await db
          .insert(examSubjectTable)
          .values(subjectIds.map((subjectId) => ({ examId: id, subjectId })));

      const links = await db
        .select({ subjectId: examSubjectTable.subjectId })
        .from(examSubjectTable)
        .where(eq(examSubjectTable.examId, id));

      return c.json({
        subjectIds: links.map((l) => l.subjectId),
      } satisfies z.infer<typeof examSubjectResponseSchema>);
    }
  );
