import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { categoryTable } from 'src/db/schema';
import { TransactionEnv } from 'src/middleware/transaction';
import { NotFoundError } from 'src/model/error';

export const postCategorySchema = z.object({
  name: z.string().min(1),
});

export const category = new Hono<TransactionEnv>()
  .get('/', async (c) => {
    const categories = await c.get('db').select().from(categoryTable);
    return c.json(categories);
  })
  .get('/:id', async (c) => {
    const [found] = await c
      .get('db')
      .select()
      .from(categoryTable)
      .where(eq(categoryTable.id, Number(c.req.param('id'))));
    if (found === undefined) throw new NotFoundError('category not found');

    return c.json(found);
  })
  .post('/', zValidator('json', postCategorySchema), async (c) => {
    const { name } = c.req.valid('json');
    const db = c.get('db');

    const [{ insertId }] = await db
      .insert(categoryTable)
      .values({ name, createdAt: new Date() });
    const [saved] = await db
      .select()
      .from(categoryTable)
      .where(eq(categoryTable.id, insertId));

    return c.json(saved, 201);
  });
