import { zValidator } from '@hono/zod-validator';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { examSubjectTable, examTable, subjectTable } from 'src/db/schema';
import { TransactionEnv } from 'src/middleware/transaction';
import { NotFoundError } from 'src/model/error';

export const examBodySchema = z.object({
  name: z.string().min(1),
});

export const examSubjectBodySchema = z.object({
  subjectIds: z.array(z.number().int().positive()),
});

export const exam = new Hono<TransactionEnv>()
  .get('/', async (c) => {
    console.log('GET /api/exam');
    const exams = await c
      .get('db')
      .select({
        id: examTable.id,
        name: examTable.name,
        createdAt: examTable.createdAt,
        // Read-only summary for the admin list -- subjects aren't
        // editable through this endpoint, so a formatted CSV string is
        // all the UI needs (no reason to ship structured subject data
        // the client can't act on).
        subjects: sql<string | null>`GROUP_CONCAT(
          ${subjectTable.name} ORDER BY ${subjectTable.name} SEPARATOR ', '
        )`,
      })
      .from(examTable)
      .leftJoin(examSubjectTable, eq(examSubjectTable.examId, examTable.id))
      .leftJoin(subjectTable, eq(subjectTable.id, examSubjectTable.subjectId))
      .groupBy(examTable.id);
    return c.json(exams);
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
