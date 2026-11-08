import { zValidator } from '@hono/zod-validator';
import { asc, count, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { charityCategoryTable } from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT } from 'src/lib/paginator';
import { TransactionEnv } from 'src/middleware/transaction';

/**
 * The seven public-interest categories, read-only.
 *
 * Read-only because the rows are seeded (db/script/v1.1.0/
 * insert_charity_category.sql) and tied to the spirit species by `code`:
 * creating an eighth through an API would produce a category no egg leads
 * to, and renaming one would silently rewrite what past public records
 * say a donation supported. Changes go through SQL, deliberately.
 *
 * Reads are open, like charityOrganization's: these names are printed on
 * the public transparency page, so there is nothing here to gate. The
 * admin organisation form is the other caller -- it cannot offer a
 * category picker without this list, and deriving one from /api/species
 * would hide any category that has no egg yet.
 */

export const charityCategoryListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
  // The two literal strings rather than z.coerce.boolean(), which maps
  // every non-empty query value -- "false" included -- to true.
  isActive: z.enum(['true', 'false']).optional(),
});

export const charityCategory = new Hono<TransactionEnv>().get(
  '/',
  zValidator('query', charityCategoryListQuerySchema),
  async (c) => {
    const { limit, offset, isActive } = c.req.valid('query');
    console.log(
      `GET /api/charity-category limit=${limit} offset=${offset} isActive=${isActive ?? ''}`
    );
    const db = c.get('db');

    const where =
      isActive === undefined
        ? undefined
        : eq(charityCategoryTable.isActive, isActive === 'true');

    const [{ total }] = await db
      .select({ total: count() })
      .from(charityCategoryTable)
      .where(where);
    const rows = await db
      .select()
      .from(charityCategoryTable)
      .where(where)
      // id as the tiebreaker: sortOrder is hand-assigned and two rows
      // sharing a value is normal, so without it a paginated list can
      // repeat or skip one.
      .orderBy(asc(charityCategoryTable.sortOrder), asc(charityCategoryTable.id))
      .limit(limit)
      .offset(offset);

    return c.json({
      data: rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        sortOrder: row.sortOrder,
        isActive: row.isActive,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      paginate: genPagination(total, limit, offset),
    });
  }
);
