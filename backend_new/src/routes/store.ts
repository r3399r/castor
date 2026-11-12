import { zValidator } from '@hono/zod-validator';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { guardianTable, pointTransactionTable, userGuardianTable, userTable } from 'src/db/schema';
import { BadRequestError, NotFoundError } from 'src/model/error';
import { UserEnv } from 'src/middleware/requireUser';

export const redeemBodySchema = z.object({ speciesId: z.number().int().positive() });

/**
 * A species on the shelf, as this API reports it.
 *
 * A schema rather than the hand-written DTO that used to sit here: it is
 * the single description of the response, the handler's return is
 * checked against it, and the OpenAPI document is generated from it.
 * See "The OpenAPI document" in AGENTS.md.
 */
export const guardianSpeciesSchema = z.object({
  id: z.number().int(),
  code: z.string().describe('What the frontend keys this species\' artwork by'),
  name: z.string(),
  theme: z.string(),
  cost: z.number().int().describe('Points to redeem one'),
  owned: z.boolean(),
  level: z
    .number()
    .int()
    .nullable()
    .describe(
      'How far this species has been grown, or null when not owned. The collection view needs the level and not just `owned`: it shows progress per species and sorts the started ones first.'
    ),
});

export const getStoreSpeciesResponseSchema = z.object({
  data: z.array(guardianSpeciesSchema),
  totalPoints: z.number().int().describe("The caller's balance, so the shelf needs no second call"),
});

export const postStoreRedeemResponseSchema = z.object({
  guardian: z.object({
    id: z.number().int().describe('The new user_guardian row, not the species'),
    speciesId: z.number().int(),
    level: z.number().int(),
    xp: z.number().int(),
  }),
  totalPoints: z.number().int().describe('The balance after the cost was taken'),
});

const speciesDoc = describeRoute({
  summary: 'The species on sale, and which of them the caller owns',
  description:
    'Behind requireUser. Active species only, unlike the admin catalog at GET /api/species: a retired one still exists for whoever owns it, but it is not on sale.',
  tags: ['store'],
  responses: {
    200: {
      description: 'The shelf, and the balance to spend on it',
      content: { 'application/json': { schema: resolver(getStoreSpeciesResponseSchema) } },
    },
    401: { description: 'No valid identity' },
  },
});

const redeemDoc = describeRoute({
  summary: 'Redeem a species',
  description:
    'Behind requireUser. Spends `cost` points and hatches the egg at level 1. Only `totalPoints` is decremented, never `lifetimePoints`, so redeeming never costs leaderboard rank.',
  tags: ['store'],
  responses: {
    200: {
      description: 'The new spirit and the balance left',
      content: { 'application/json': { schema: resolver(postStoreRedeemResponseSchema) } },
    },
    400: {
      description:
        'Already owned (ALREADY_OWNED) or not enough points (INSUFFICIENT_POINTS) -- the code in the body says which',
    },
    401: { description: 'No valid identity' },
    404: { description: 'No such species, or it is not on sale' },
  },
});

export const store = new Hono<UserEnv>()
  .get('/species', speciesDoc, async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    console.log(`GET /api/store/species userId=${user.id}`);

    const species = await db
      .select()
      .from(guardianTable)
      .where(eq(guardianTable.isActive, true))
      .orderBy(asc(guardianTable.sortOrder));

    const owned = await db
      .select({ guardianId: userGuardianTable.guardianId, level: userGuardianTable.level })
      .from(userGuardianTable)
      .where(
        and(
          eq(userGuardianTable.userId, user.id),
          inArray(
            userGuardianTable.guardianId,
            species.map((s) => s.id)
          )
        )
      );
    const levelBySpeciesId = new Map(owned.map((o) => [o.guardianId, o.level]));

    const data: z.infer<typeof guardianSpeciesSchema>[] = species.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      theme: s.theme,
      cost: s.cost,
      owned: levelBySpeciesId.has(s.id),
      level: levelBySpeciesId.get(s.id) ?? null,
    }));

    return c.json({
      data,
      totalPoints: user.totalPoints,
    } satisfies z.infer<typeof getStoreSpeciesResponseSchema>);
  })
  .post('/redeem', redeemDoc, zValidator('json', redeemBodySchema), async (c) => {
    const { speciesId } = c.req.valid('json');
    const user = c.get('user');
    const db = c.get('db');
    console.log(`POST /api/store/redeem userId=${user.id} speciesId=${speciesId}`);

    const [species] = await db
      .select()
      .from(guardianTable)
      .where(and(eq(guardianTable.id, speciesId), eq(guardianTable.isActive, true)));
    if (species === undefined) throw new NotFoundError(`guardian ${speciesId} not found`);

    const [existing] = await db
      .select({ id: userGuardianTable.id })
      .from(userGuardianTable)
      .where(and(eq(userGuardianTable.userId, user.id), eq(userGuardianTable.guardianId, speciesId)));
    if (existing !== undefined) throw new BadRequestError('already own this guardian', 'ALREADY_OWNED');

    if (user.totalPoints < species.cost) throw new BadRequestError('insufficient points', 'INSUFFICIENT_POINTS');

    const now = new Date();
    const [{ insertId: userGuardianId }] = await db
      .insert(userGuardianTable)
      .values({ userId: user.id, guardianId: speciesId, createdAt: now, updatedAt: now });

    // Spending only decrements totalPoints, never lifetimePoints -- same
    // split reply.ts's earning side relies on, so redeeming a guardian
    // never hurts leaderboard rank.
    const newTotalPoints = user.totalPoints - species.cost;
    await db
      .update(userTable)
      .set({ totalPoints: sql`${userTable.totalPoints} - ${species.cost}`, updatedAt: now })
      .where(eq(userTable.id, user.id));

    await db.insert(pointTransactionTable).values({
      userId: user.id,
      type: 'SPEND_EGG_REDEEM',
      amount: -species.cost,
      balanceAfter: newTotalPoints,
      createdAt: now,
    });

    return c.json({
      guardian: { id: userGuardianId, speciesId, level: 1, xp: 0 },
      totalPoints: newTotalPoints,
    } satisfies z.infer<typeof postStoreRedeemResponseSchema>);
  });
