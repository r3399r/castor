import { zValidator } from '@hono/zod-validator';
import { asc, count, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { conceptGroupTable, subjectTable } from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT } from 'src/lib/paginator';
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

export const conceptGroup = new Hono<TransactionEnv>()
  .get('/', zValidator('query', conceptGroupListQuerySchema), async (c) => {
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

    return c.json({ data, paginate: genPagination(total, limit, offset) });
  })
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    console.log(`GET /api/concept-group/${id}`);
    const [found] = await c
      .get('db')
      .select()
      .from(conceptGroupTable)
      .where(eq(conceptGroupTable.id, Number(id)));
    if (found === undefined)
      throw new NotFoundError(`concept group ${id} not found`);

    return c.json(found);
  })
  .post('/', zValidator('json', conceptGroupBodySchema), async (c) => {
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

    return c.json(saved, 201);
  })
  .put('/:id', zValidator('json', conceptGroupBodySchema), async (c) => {
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

    return c.json(updated);
  })
  .delete('/:id', async (c) => {
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
