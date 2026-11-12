import 'zod-openapi/extend';
import { zValidator } from '@hono/zod-validator';
import { asc, count, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { charityCategoryTable } from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT, paginationSchema } from 'src/lib/paginator';
import { TransactionEnv } from 'src/middleware/transaction';

/**
 * The seven public-interest categories, read-only.
 *
 * Read-only because the rows are seeded (db/script/v1.0.0/
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

/**
 * A public-interest category as this API reports it.
 *
 * A schema rather than a hand-written type: it is the single description
 * of the response, the handler's return is checked against it, and the
 * OpenAPI document is generated from it. See "The OpenAPI document" in
 * AGENTS.md.
 */
export const charityCategoryRowSchema = z.object({
  id: z.number().int(),
  code: z
    .string()
    .describe('Stable identifier, and what ties a spirit species to this category'),
  name: z.string(),
  sortOrder: z.number().int().describe('Ascending, hand-assigned; ties are broken by id'),
  isActive: z
    .boolean()
    .describe(
      'Inactive categories stay listed -- past donations point at them and the public record keeps naming them. They drop out of the picker only.'
    ),
  createdAt: z.string().nullable().describe('ISO 8601'),
  updatedAt: z.string().nullable().describe('ISO 8601'),
}).openapi({ ref: 'CharityCategoryRow' });

export const getCharityCategoryListResponseSchema = z.object({
  data: z.array(charityCategoryRowSchema),
  paginate: paginationSchema,
});

const listDoc = describeRoute({
  summary: 'List the public-interest categories',
  description:
    'Open to anyone: these names are printed on the public transparency page. GET-only, and the group is mounted behind `adminAuth`, which gates POST/PUT/DELETE -- so on a resource with none it gates nothing. That is intended here, not an oversight; the rows are seeded by SQL because they are tied to the spirit species by `code`.',
  tags: ['charity-category'],
  responses: {
    200: {
      description: 'One page of categories, ordered by sortOrder then id',
      content: {
        'application/json': { schema: resolver(getCharityCategoryListResponseSchema) },
      },
    },
    400: { description: 'limit beyond the cap, or an isActive that is not "true" or "false"' },
  },
});

export const charityCategory = new Hono<TransactionEnv>().get(
  '/',
  listDoc,
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
        // Serialised here rather than left to c.json: the columns are
        // Dates, every type in the repo calls these fields strings, and
        // JSON.stringify happening to agree is not a contract.
        createdAt: row.createdAt?.toISOString() ?? null,
        updatedAt: row.updatedAt?.toISOString() ?? null,
      })),
      paginate: genPagination(total, limit, offset),
    } satisfies z.infer<typeof getCharityCategoryListResponseSchema>);
  }
);
