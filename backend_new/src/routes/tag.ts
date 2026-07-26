import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { tagTable } from 'src/db/schema';
import { TransactionEnv } from 'src/middleware/transaction';
import { NotFoundError } from 'src/model/error';

export const tagBodySchema = z.object({
  name: z.string().min(1),
  subjectId: z.number().int().positive(),
});

export const tag = new Hono<TransactionEnv>()
  .get('/', async (c) => {
    console.log('GET /api/tag');
    const tags = await c.get('db').select().from(tagTable);
    return c.json(tags);
  })
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    console.log(`GET /api/tag/${id}`);
    const [found] = await c
      .get('db')
      .select()
      .from(tagTable)
      .where(eq(tagTable.id, Number(id)));
    if (found === undefined) throw new NotFoundError(`tag ${id} not found`);

    return c.json(found);
  })
  .post('/', zValidator('json', tagBodySchema), async (c) => {
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

    return c.json(saved, 201);
  })
  .put('/:id', zValidator('json', tagBodySchema), async (c) => {
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

    return c.json(updated);
  })
  .delete('/:id', async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`DELETE /api/tag/${id}`);

    const [{ affectedRows }] = await db
      .delete(tagTable)
      .where(eq(tagTable.id, id));
    if (affectedRows === 0) throw new NotFoundError(`tag ${id} not found`);

    return c.body(null, 204);
  });
