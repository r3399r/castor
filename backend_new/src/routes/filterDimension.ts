import { zValidator } from '@hono/zod-validator';
import { asc, count, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { categoryTable, filterDimensionTable } from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT } from 'src/lib/paginator';
import { TransactionEnv } from 'src/middleware/transaction';
import { NotFoundError } from 'src/model/error';

export const filterDimensionBodySchema = z.object({
  name: z.string().min(1),
  categoryId: z.number().int().positive(),
  sortOrder: z.number().int().min(0).max(255).optional().default(0),
});

// "category" sorts by the linked category's name -- requires a join purely
// for ordering; the response shape stays {id, name, categoryId, sortOrder}
// since the admin UI already resolves category display info from its own
// separately-fetched category list.
const FILTER_DIMENSION_SORT_COLUMNS = {
  id: filterDimensionTable.id,
  name: filterDimensionTable.name,
  sortOrder: filterDimensionTable.sortOrder,
  category: categoryTable.name,
};

export const filterDimensionListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sort: z.enum(['id', 'name', 'sortOrder', 'category']).optional().default('sortOrder'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

export const filterDimension = new Hono<TransactionEnv>()
  .get('/', zValidator('query', filterDimensionListQuerySchema), async (c) => {
    const { limit, offset, sort, order } = c.req.valid('query');
    console.log(
      `GET /api/filter-dimension limit=${limit} offset=${offset} sort=${sort} order=${order}`
    );
    const db = c.get('db');

    const [{ total }] = await db
      .select({ total: count() })
      .from(filterDimensionTable);
    const sortColumn = FILTER_DIMENSION_SORT_COLUMNS[sort];
    const data = await db
      .select({
        id: filterDimensionTable.id,
        name: filterDimensionTable.name,
        categoryId: filterDimensionTable.categoryId,
        sortOrder: filterDimensionTable.sortOrder,
      })
      .from(filterDimensionTable)
      .innerJoin(
        categoryTable,
        eq(categoryTable.id, filterDimensionTable.categoryId)
      )
      .orderBy(order === 'desc' ? desc(sortColumn) : asc(sortColumn))
      .limit(limit)
      .offset(offset);

    return c.json({ data, paginate: genPagination(total, limit, offset) });
  })
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    console.log(`GET /api/filter-dimension/${id}`);
    const [found] = await c
      .get('db')
      .select()
      .from(filterDimensionTable)
      .where(eq(filterDimensionTable.id, Number(id)));
    if (found === undefined)
      throw new NotFoundError(`filter dimension ${id} not found`);

    return c.json(found);
  })
  .post('/', zValidator('json', filterDimensionBodySchema), async (c) => {
    const { name, categoryId, sortOrder } = c.req.valid('json');
    console.log(
      `POST /api/filter-dimension name=${name} categoryId=${categoryId} sortOrder=${sortOrder}`
    );
    const db = c.get('db');

    const [{ insertId }] = await db
      .insert(filterDimensionTable)
      .values({ name, categoryId, sortOrder });
    const [saved] = await db
      .select()
      .from(filterDimensionTable)
      .where(eq(filterDimensionTable.id, insertId));

    return c.json(saved, 201);
  })
  .put(
    '/:id',
    zValidator('json', filterDimensionBodySchema),
    async (c) => {
      const db = c.get('db');
      const id = Number(c.req.param('id'));
      const { name, categoryId, sortOrder } = c.req.valid('json');
      console.log(
        `PUT /api/filter-dimension/${id} name=${name} categoryId=${categoryId} sortOrder=${sortOrder}`
      );

      const [{ affectedRows }] = await db
        .update(filterDimensionTable)
        .set({ name, categoryId, sortOrder })
        .where(eq(filterDimensionTable.id, id));
      if (affectedRows === 0)
        throw new NotFoundError(`filter dimension ${id} not found`);

      const [updated] = await db
        .select()
        .from(filterDimensionTable)
        .where(eq(filterDimensionTable.id, id));

      return c.json(updated);
    }
  )
  .delete('/:id', async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`DELETE /api/filter-dimension/${id}`);

    // No cascade for filter_option's required (NOT NULL) dimension_id --
    // same reasoning as tag/concept_group/concept's required parent FKs: a
    // dimension with options still under it should reject the delete
    // rather than silently orphan or destroy those options.
    const [{ affectedRows }] = await db
      .delete(filterDimensionTable)
      .where(eq(filterDimensionTable.id, id));
    if (affectedRows === 0)
      throw new NotFoundError(`filter dimension ${id} not found`);

    return c.body(null, 204);
  });
