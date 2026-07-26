import { zValidator } from '@hono/zod-validator';
import { asc, count, desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  filterDimensionTable,
  filterOptionTable,
  filterSubjectOptionTable,
  subjectTable,
} from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT } from 'src/lib/paginator';
import { TransactionEnv } from 'src/middleware/transaction';
import { NotFoundError } from 'src/model/error';

export const filterOptionBodySchema = z.object({
  name: z.string().min(1),
  dimensionId: z.number().int().positive(),
  // Nullable, not just optional -- "no parent" is a real, settable state
  // (a top-level option), distinct from "field omitted".
  parentId: z.number().int().positive().nullable().optional().default(null),
});

export const filterOptionSubjectBodySchema = z.object({
  subjectIds: z.array(z.number().int().positive()),
});

// Reused in both the SELECT list and ORDER BY below -- same JS reference,
// so the identical GROUP_CONCAT expression is emitted in both places,
// which MySQL requires for ordering by an aggregate in a grouped query.
const subjectsExpr = sql<string | null>`GROUP_CONCAT(
  ${subjectTable.name} ORDER BY ${subjectTable.name} SEPARATOR ', '
)`;

// "dimension" sorts by the linked dimension's name -- requires a join
// purely for ordering; the response shape stays
// {id, name, dimensionId, parentId, subjects} since the admin UI already
// resolves dimension/parent display info from its own separately-fetched
// lists -- "subjects" is a read-only summary of the filter_subject_option
// links, not editable through this endpoint.
// No sort-by-parent column: parentId is optional and secondary to the
// dimension grouping, and sorting by it would need a self-join alias for
// little practical benefit over the id/name/dimension/subjects sorts
// already here.
const FILTER_OPTION_SORT_COLUMNS = {
  id: filterOptionTable.id,
  name: filterOptionTable.name,
  dimension: filterDimensionTable.name,
  subjects: subjectsExpr,
};

export const filterOptionListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sort: z.enum(['id', 'name', 'dimension', 'subjects']).optional().default('id'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

export const filterOption = new Hono<TransactionEnv>()
  .get('/', zValidator('query', filterOptionListQuerySchema), async (c) => {
    const { limit, offset, sort, order } = c.req.valid('query');
    console.log(
      `GET /api/filter-option limit=${limit} offset=${offset} sort=${sort} order=${order}`
    );
    const db = c.get('db');

    const [{ total }] = await db
      .select({ total: count() })
      .from(filterOptionTable);
    const sortColumn = FILTER_OPTION_SORT_COLUMNS[sort];
    const data = await db
      .select({
        id: filterOptionTable.id,
        name: filterOptionTable.name,
        dimensionId: filterOptionTable.dimensionId,
        parentId: filterOptionTable.parentId,
        subjects: subjectsExpr,
      })
      .from(filterOptionTable)
      .innerJoin(
        filterDimensionTable,
        eq(filterDimensionTable.id, filterOptionTable.dimensionId)
      )
      .leftJoin(
        filterSubjectOptionTable,
        eq(filterSubjectOptionTable.optionId, filterOptionTable.id)
      )
      .leftJoin(
        subjectTable,
        eq(subjectTable.id, filterSubjectOptionTable.subjectId)
      )
      .groupBy(filterOptionTable.id)
      .orderBy(order === 'desc' ? desc(sortColumn) : asc(sortColumn))
      .limit(limit)
      .offset(offset);

    return c.json({ data, paginate: genPagination(total, limit, offset) });
  })
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    console.log(`GET /api/filter-option/${id}`);
    const [found] = await c
      .get('db')
      .select()
      .from(filterOptionTable)
      .where(eq(filterOptionTable.id, Number(id)));
    if (found === undefined)
      throw new NotFoundError(`filter option ${id} not found`);

    return c.json(found);
  })
  .post('/', zValidator('json', filterOptionBodySchema), async (c) => {
    const { name, dimensionId, parentId } = c.req.valid('json');
    console.log(
      `POST /api/filter-option name=${name} dimensionId=${dimensionId} parentId=${parentId}`
    );
    const db = c.get('db');

    const [{ insertId }] = await db
      .insert(filterOptionTable)
      .values({ name, dimensionId, parentId });
    const [saved] = await db
      .select()
      .from(filterOptionTable)
      .where(eq(filterOptionTable.id, insertId));

    return c.json(saved, 201);
  })
  .put('/:id', zValidator('json', filterOptionBodySchema), async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    const { name, dimensionId, parentId } = c.req.valid('json');
    console.log(
      `PUT /api/filter-option/${id} name=${name} dimensionId=${dimensionId} parentId=${parentId}`
    );

    const [{ affectedRows }] = await db
      .update(filterOptionTable)
      .set({ name, dimensionId, parentId })
      .where(eq(filterOptionTable.id, id));
    if (affectedRows === 0)
      throw new NotFoundError(`filter option ${id} not found`);

    const [updated] = await db
      .select()
      .from(filterOptionTable)
      .where(eq(filterOptionTable.id, id));

    return c.json(updated);
  })
  .delete('/:id', async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`DELETE /api/filter-option/${id}`);

    // parentId is optional, so a child pointing at this option should just
    // become top-level rather than block the delete or get destroyed --
    // unlike the required-FK precedent used for dimension_id/subject_id.
    await db
      .update(filterOptionTable)
      .set({ parentId: null })
      .where(eq(filterOptionTable.parentId, id));
    // Clear filter_subject_option links -- same reasoning as
    // subject_category/exam_subject: a pure join row has no meaning once
    // either side is gone.
    await db
      .delete(filterSubjectOptionTable)
      .where(eq(filterSubjectOptionTable.optionId, id));
    const [{ affectedRows }] = await db
      .delete(filterOptionTable)
      .where(eq(filterOptionTable.id, id));
    if (affectedRows === 0)
      throw new NotFoundError(`filter option ${id} not found`);

    return c.body(null, 204);
  })
  .get('/:id/subject', async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`GET /api/filter-option/${id}/subject`);

    const [found] = await db
      .select()
      .from(filterOptionTable)
      .where(eq(filterOptionTable.id, id));
    if (found === undefined)
      throw new NotFoundError(`filter option ${id} not found`);

    const links = await db
      .select({ subjectId: filterSubjectOptionTable.subjectId })
      .from(filterSubjectOptionTable)
      .where(eq(filterSubjectOptionTable.optionId, id));

    return c.json({ subjectIds: links.map((l) => l.subjectId) });
  })
  .put(
    '/:id/subject',
    zValidator('json', filterOptionSubjectBodySchema),
    async (c) => {
      const db = c.get('db');
      const id = Number(c.req.param('id'));
      const { subjectIds } = c.req.valid('json');
      console.log(
        `PUT /api/filter-option/${id}/subject subjectIds=${subjectIds.join(',')}`
      );

      const [found] = await db
        .select()
        .from(filterOptionTable)
        .where(eq(filterOptionTable.id, id));
      if (found === undefined)
        throw new NotFoundError(`filter option ${id} not found`);

      // Full-set replace: simplest correct semantics for a multi-select
      // "these are the subjects now" save, and cheap at this table size.
      await db
        .delete(filterSubjectOptionTable)
        .where(eq(filterSubjectOptionTable.optionId, id));
      if (subjectIds.length > 0)
        await db
          .insert(filterSubjectOptionTable)
          .values(
            subjectIds.map((subjectId) => ({ subjectId, optionId: id }))
          );

      const links = await db
        .select({ subjectId: filterSubjectOptionTable.subjectId })
        .from(filterSubjectOptionTable)
        .where(eq(filterSubjectOptionTable.optionId, id));

      return c.json({ subjectIds: links.map((l) => l.subjectId) });
    }
  );
