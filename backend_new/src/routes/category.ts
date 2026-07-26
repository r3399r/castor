import { zValidator } from '@hono/zod-validator';
import { asc, count, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { categoryTable, subjectCategoryTable } from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT } from 'src/lib/paginator';
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

export const category = new Hono<TransactionEnv>()
  .get('/', zValidator('query', categoryListQuerySchema), async (c) => {
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

    return c.json({ data, paginate: genPagination(total, limit, offset) });
  })
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    console.log(`GET /api/category/${id}`);
    const [found] = await c
      .get('db')
      .select()
      .from(categoryTable)
      .where(eq(categoryTable.id, Number(id)));
    if (found === undefined)
      throw new NotFoundError(`category ${id} not found`);

    return c.json(found);
  })
  .post('/', zValidator('json', postCategorySchema), async (c) => {
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

    return c.json(saved, 201);
  })
  .put('/:id', zValidator('json', postCategorySchema), async (c) => {
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

    return c.json(updated);
  })
  .delete('/:id', async (c) => {
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
  });
