import { zValidator } from '@hono/zod-validator';
import { asc, count, desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { examSubjectTable, examTable, subjectTable } from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT } from 'src/lib/paginator';
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

export const exam = new Hono<TransactionEnv>()
  .get('/', zValidator('query', examListQuerySchema), async (c) => {
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

    return c.json({ data, paginate: genPagination(total, limit, offset) });
  })
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    console.log(`GET /api/exam/${id}`);
    const [found] = await c
      .get('db')
      .select()
      .from(examTable)
      .where(eq(examTable.id, Number(id)));
    if (found === undefined) throw new NotFoundError(`exam ${id} not found`);

    return c.json(found);
  })
  .post('/', zValidator('json', examBodySchema), async (c) => {
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

    return c.json(saved, 201);
  })
  .put('/:id', zValidator('json', examBodySchema), async (c) => {
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

    return c.json(updated);
  })
  .delete('/:id', async (c) => {
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
  .get('/:id/subject', async (c) => {
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

    return c.json({ subjectIds: links.map((l) => l.subjectId) });
  })
  .put(
    '/:id/subject',
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

      return c.json({ subjectIds: links.map((l) => l.subjectId) });
    }
  );
