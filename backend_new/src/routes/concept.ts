import { zValidator } from '@hono/zod-validator';
import { asc, count, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { conceptGroupTable, conceptTable } from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT } from 'src/lib/paginator';
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

export const concept = new Hono<TransactionEnv>()
  .get('/', zValidator('query', conceptListQuerySchema), async (c) => {
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

    return c.json({ data, paginate: genPagination(total, limit, offset) });
  })
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    console.log(`GET /api/concept/${id}`);
    const [found] = await c
      .get('db')
      .select()
      .from(conceptTable)
      .where(eq(conceptTable.id, Number(id)));
    if (found === undefined) throw new NotFoundError(`concept ${id} not found`);

    return c.json(found);
  })
  .post('/', zValidator('json', conceptBodySchema), async (c) => {
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

    return c.json(saved, 201);
  })
  .put('/:id', zValidator('json', conceptBodySchema), async (c) => {
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

    return c.json(updated);
  })
  .delete('/:id', async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`DELETE /api/concept/${id}`);

    const [{ affectedRows }] = await db
      .delete(conceptTable)
      .where(eq(conceptTable.id, id));
    if (affectedRows === 0) throw new NotFoundError(`concept ${id} not found`);

    return c.body(null, 204);
  });
