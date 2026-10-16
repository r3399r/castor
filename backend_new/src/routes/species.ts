import { asc, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { guardianTable, userGuardianTable } from 'src/db/schema';
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
export const species = new Hono<TransactionEnv>().get('/', async (c) => {
  console.log('GET /api/species');
  const db = c.get('db');

  // Unlike GET /store/species this does not filter on isActive -- a
  // retired species still exists for whoever owns one, and seeing it is
  // the point of a catalog view.
  const rows = await db
    .select()
    .from(guardianTable)
    .orderBy(asc(guardianTable.sortOrder), asc(guardianTable.id));

  // How many users hold each species, so an admin can tell a species
  // nobody has from one that is merely retired.
  const owners = await db
    .select({
      guardianId: userGuardianTable.guardianId,
      ownerCount: sql<number>`count(*)`,
    })
    .from(userGuardianTable)
    .groupBy(userGuardianTable.guardianId);
  const ownerCountById = new Map(owners.map((o) => [o.guardianId, Number(o.ownerCount)]));

  return c.json(
    rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      theme: row.theme,
      cost: row.cost,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      ownerCount: ownerCountById.get(row.id) ?? 0,
    }))
  );
});
