import { zValidator } from '@hono/zod-validator';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  categoryTable,
  subjectCategoryTable,
  subjectTable,
} from 'src/db/schema';
import { TransactionEnv } from 'src/middleware/transaction';
import { NotFoundError } from 'src/model/error';

export const subjectBodySchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().min(0).max(255).optional().default(0),
});

export const subjectCategoryBodySchema = z.object({
  categoryIds: z.array(z.number().int().positive()),
});

export const subject = new Hono<TransactionEnv>()
  .get('/', async (c) => {
    console.log('GET /api/subject');
    const subjects = await c
      .get('db')
      .select({
        id: subjectTable.id,
        name: subjectTable.name,
        sortOrder: subjectTable.sortOrder,
        createdAt: subjectTable.createdAt,
        // Read-only summary for the admin list -- categories aren't
        // editable through this endpoint, so a formatted CSV string is
        // all the UI needs (no reason to ship structured category data
        // the client can't act on).
        categories: sql<string | null>`GROUP_CONCAT(
          ${categoryTable.name} ORDER BY ${categoryTable.name} SEPARATOR ', '
        )`,
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
      .orderBy(subjectTable.sortOrder);
    return c.json(subjects);
  })
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    console.log(`GET /api/subject/${id}`);
    const [found] = await c
      .get('db')
      .select()
      .from(subjectTable)
      .where(eq(subjectTable.id, Number(id)));
    if (found === undefined)
      throw new NotFoundError(`subject ${id} not found`);

    return c.json(found);
  })
  .post('/', zValidator('json', subjectBodySchema), async (c) => {
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

    return c.json(saved, 201);
  })
  .put('/:id', zValidator('json', subjectBodySchema), async (c) => {
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

    return c.json(updated);
  })
  .delete('/:id', async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`DELETE /api/subject/${id}`);

    // Clear subject_category links first -- the FK would otherwise reject
    // deleting a subject that still has linked categories.
    await db
      .delete(subjectCategoryTable)
      .where(eq(subjectCategoryTable.subjectId, id));
    const [{ affectedRows }] = await db
      .delete(subjectTable)
      .where(eq(subjectTable.id, id));
    if (affectedRows === 0)
      throw new NotFoundError(`subject ${id} not found`);

    return c.body(null, 204);
  })
  .get('/:id/category', async (c) => {
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

    return c.json({ categoryIds: links.map((l) => l.categoryId) });
  })
  .put(
    '/:id/category',
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

      return c.json({ categoryIds: links.map((l) => l.categoryId) });
    }
  );
