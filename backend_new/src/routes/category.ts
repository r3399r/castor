import { zValidator } from '@hono/zod-validator';
import { asc, count, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  categoryTable,
  filterDimensionTable,
  filterOptionTable,
  filterSubjectOptionTable,
  subjectCategoryTable,
  subjectTable,
} from 'src/db/schema';
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
  })
  .get('/:id/subject', async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`GET /api/category/${id}/subject`);

    const [found] = await db.select().from(categoryTable).where(eq(categoryTable.id, id));
    if (found === undefined) throw new NotFoundError(`category ${id} not found`);

    // Read-only, unpaginated -- a category's subject list is what the
    // practice-page filter flow needs up front, and it's not a dataset
    // that grows anywhere near pagination territory.
    const subjects = await db
      .select({
        id: subjectTable.id,
        name: subjectTable.name,
        sortOrder: subjectTable.sortOrder,
      })
      .from(subjectTable)
      .innerJoin(subjectCategoryTable, eq(subjectCategoryTable.subjectId, subjectTable.id))
      .where(eq(subjectCategoryTable.categoryId, id))
      .orderBy(asc(subjectTable.sortOrder));

    return c.json(subjects);
  })
  .get('/:id/filter', async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`GET /api/category/${id}/filter`);

    const [found] = await db.select().from(categoryTable).where(eq(categoryTable.id, id));
    if (found === undefined) throw new NotFoundError(`category ${id} not found`);

    // Three flat queries (dimensions -> their options -> those options'
    // subject links) instead of the N+1 that composing this client-side
    // from /api/filter-option/:id/subject per option would need.
    const dimensions = await db
      .select()
      .from(filterDimensionTable)
      .where(eq(filterDimensionTable.categoryId, id))
      .orderBy(asc(filterDimensionTable.sortOrder));
    const dimensionIds = dimensions.map((d) => d.id);

    const options =
      dimensionIds.length > 0
        ? await db
            .select()
            .from(filterOptionTable)
            .where(inArray(filterOptionTable.dimensionId, dimensionIds))
        : [];
    const optionIds = options.map((o) => o.id);

    const subjectLinks =
      optionIds.length > 0
        ? await db
            .select()
            .from(filterSubjectOptionTable)
            .where(inArray(filterSubjectOptionTable.optionId, optionIds))
        : [];
    const subjectIdsByOption = new Map<number, number[]>();
    for (const link of subjectLinks) {
      const list = subjectIdsByOption.get(link.optionId) ?? [];
      list.push(link.subjectId);
      subjectIdsByOption.set(link.optionId, list);
    }

    const optionsByDimension = new Map<number, typeof options>();
    for (const option of options) {
      const list = optionsByDimension.get(option.dimensionId) ?? [];
      list.push(option);
      optionsByDimension.set(option.dimensionId, list);
    }

    return c.json(
      dimensions.map((dim) => ({
        id: dim.id,
        name: dim.name,
        sortOrder: dim.sortOrder,
        options: (optionsByDimension.get(dim.id) ?? []).map((opt) => ({
          id: opt.id,
          name: opt.name,
          parentId: opt.parentId,
          subjectIds: subjectIdsByOption.get(opt.id) ?? [],
        })),
      }))
    );
  });
