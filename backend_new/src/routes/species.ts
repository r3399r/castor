import 'zod-openapi/extend';
import { asc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { charityCategoryTable, guardianTable, userGuardianTable } from 'src/db/schema';
import { TransactionEnv } from 'src/middleware/transaction';

/**
 * Read-only admin view of the guardian catalog.
 *
 * Deliberately GET-only. A species is half a database row and half a set
 * of artwork files keyed by `code` in the frontend, so creating one here
 * would only ever produce a row with no pictures. Adding a species means
 * shipping artwork and the `code` mapping together, which is a code
 * change, not an admin action.
 *
 * Mounted behind `requireAdmin`, not `adminAuth`: the latter only gates
 * POST/PUT/DELETE and would let every GET through, which on a GET-only
 * resource is no protection at all.
 */
/**
 * A species in the admin catalog, as this API reports it.
 *
 * A schema rather than a hand-written type: it is the single description
 * of the response, the handler's return is checked against it, and the
 * OpenAPI document is generated from it. Nothing in packages/shared
 * describes this response at all -- the admin page that reads it
 * declares its own shape. See "The OpenAPI document" in AGENTS.md.
 */
export const adminSpeciesSchema = z.object({
  id: z.number().int(),
  code: z.string().describe("What the frontend keys this species' artwork by"),
  name: z.string(),
  theme: z.string().describe("The egg's own label, which is not the category link below"),
  cost: z.number().int().describe('Points to redeem one'),
  sortOrder: z.number().int(),
  isActive: z.boolean().describe('Whether it is still on sale; owners of a retired one keep it'),
  category: z
    .object({ id: z.number().int(), name: z.string() })
    .nullable()
    .describe(
      'The donation category this species supports, or null for one tied to none. null is both what the planned VIP spirit is and what a seeded egg looks like when its category_id was forgotten -- indistinguishable from here, which is why the admin page says it out loud.'
    ),
  ownersByLevel: z
    .record(z.number().int())
    .describe(
      'Owners keyed by the level they have grown to. An absent level has no owners; the caller decides which levels to show. Keys are strings because JSON object keys are.'
    ),
}).openapi({ ref: 'AdminSpecies' });

export const getSpeciesResponseSchema = z.array(adminSpeciesSchema);

const listDoc = describeRoute({
  summary: 'The guardian catalog, with owner counts per level',
  description:
    'Behind requireAdmin -- every method, GET included. `adminAuth` would have been no protection at all here, since it only gates POST/PUT/DELETE and this resource has none. GET-only on purpose: a species is half a row and half a set of artwork files keyed by `code`, so creating one through an API would only ever produce a row with no pictures.',
  tags: ['species'],
  responses: {
    200: {
      description: 'Every species, retired ones included, ordered by sortOrder then id',
      content: { 'application/json': { schema: resolver(getSpeciesResponseSchema) } },
    },
    401: { description: 'No valid identity' },
    403: { description: 'Not an admin' },
  },
});

export const species = new Hono<TransactionEnv>().get('/', listDoc, async (c) => {
  console.log('GET /api/species');
  const db = c.get('db');

  // Unlike GET /store/species this does not filter on isActive -- a
  // retired species still exists for whoever owns one, and seeing it is
  // the point of a catalog view.
  //
  // Columns are listed rather than selected wholesale because of the join
  // below: a bare .select() with one would nest every row under table
  // names and silently change this response's shape.
  const rows = await db
    .select({
      id: guardianTable.id,
      code: guardianTable.code,
      name: guardianTable.name,
      theme: guardianTable.theme,
      cost: guardianTable.cost,
      sortOrder: guardianTable.sortOrder,
      isActive: guardianTable.isActive,
      categoryId: charityCategoryTable.id,
      categoryName: charityCategoryTable.name,
    })
    .from(guardianTable)
    // Left, not inner: guardian.category_id is NULL for a species tied to
    // no category, so an inner join would drop that row out of the
    // catalog altogether -- strictly worse than not naming its category.
    .leftJoin(charityCategoryTable, eq(charityCategoryTable.id, guardianTable.categoryId))
    .orderBy(asc(guardianTable.sortOrder), asc(guardianTable.id));

  // Owners broken down by the level they have grown to, which is what
  // the catalog page shows beneath each level's artwork. A bare total
  // would not answer the question the page is for -- whether anyone has
  // actually reached the later stages, or everyone stalls at LV1.
  const owners = await db
    .select({
      guardianId: userGuardianTable.guardianId,
      level: userGuardianTable.level,
      ownerCount: sql<number>`count(*)`,
    })
    .from(userGuardianTable)
    .groupBy(userGuardianTable.guardianId, userGuardianTable.level);

  // String-keyed, because that is what these become in JSON: typing
  // the map as Record<number, number> described a response shape that
  // never existed on the wire.
  const ownersByLevelById = new Map<number, Record<string, number>>();
  for (const row of owners) {
    const byLevel = ownersByLevelById.get(row.guardianId) ?? {};
    byLevel[row.level] = Number(row.ownerCount);
    ownersByLevelById.set(row.guardianId, byLevel);
  }

  return c.json(
    rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      theme: row.theme,
      cost: row.cost,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      // The donation category this species supports, or null for one
      // tied to none. Worth returning even though `theme` currently
      // reads the same: theme is the egg's own label, this is the link
      // the donation route actually reads. null is both what the planned
      // VIP spirit is and what a freshly seeded egg looks like when its
      // category_id was forgotten -- indistinguishable from here, which
      // is why the admin page says it out loud instead of leaving a gap.
      category:
        row.categoryId !== null && row.categoryName !== null
          ? { id: row.categoryId, name: row.categoryName }
          : null,
      // Keyed by level. Absent levels simply have no owners; the caller
      // decides which levels to display.
      ownersByLevel: ownersByLevelById.get(row.id) ?? {},
    })) satisfies z.infer<typeof getSpeciesResponseSchema>
  );
});
