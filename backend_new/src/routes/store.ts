import 'zod-openapi/extend';
import { zValidator } from '@hono/zod-validator';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import {
  charityCategoryTable,
  guardianTable,
  pointTransactionTable,
  userGuardianTable,
  userTable,
} from 'src/db/schema';
import { findEntitledSubscription } from 'src/lib/subscription';
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
  code: z
    .string()
    .describe(
      "What the frontend keys this species' artwork by -- it names the species drawn, not the category supported, so 'deer' is the forest egg"
    ),
  name: z.string(),
  cost: z.number().int().describe('Points to redeem one'),
  requiresSubscription: z
    .boolean()
    .describe(
      'Whether redeeming needs paid access. POST /store/redeem enforces it and answers SUBSCRIPTION_REQUIRED; a client that only hides the button changes nothing'
    ),
  category: z
    .object({ id: z.number().int(), name: z.string() })
    .nullable()
    .describe(
      'The donation category this species supports, or null for one tied to none -- the VIP egg, whose owner picks at LV5. The only name of a cause this response carries; a `theme` column held a copy of it until 2026-11-21, and null is what the shelf renders as "any category"'
    ),
  owned: z.boolean(),
  level: z
    .number()
    .int()
    .nullable()
    .describe(
      'How far this species has been grown, or null when not owned. The collection view needs the level and not just `owned`: it shows progress per species and sorts the started ones first.'
    ),
}).openapi({ ref: 'GuardianSpecies' });

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
      description: 'The new guardian and the balance left',
      content: { 'application/json': { schema: resolver(postStoreRedeemResponseSchema) } },
    },
    400: {
      description:
        'Already owned (ALREADY_OWNED), subscriber-only without paid access (SUBSCRIPTION_REQUIRED), or not enough points (INSUFFICIENT_POINTS) -- the code in the body says which',
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

    // Columns listed rather than a bare .select() because of the join
    // below: with one, a bare select nests every row under table names and
    // silently changes this response's shape.
    const species = await db
      .select({
        id: guardianTable.id,
        code: guardianTable.code,
        name: guardianTable.name,
        cost: guardianTable.cost,
        requiresSubscription: guardianTable.requiresSubscription,
        categoryId: charityCategoryTable.id,
        categoryName: charityCategoryTable.name,
      })
      .from(guardianTable)
      // Left, not inner: category_id is NULL for an egg tied to no
      // category, and an inner join would drop that egg off the shelf
      // altogether -- the VIP egg would simply never be on sale.
      .leftJoin(charityCategoryTable, eq(charityCategoryTable.id, guardianTable.categoryId))
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
      cost: s.cost,
      requiresSubscription: s.requiresSubscription,
      category:
        s.categoryId !== null && s.categoryName !== null
          ? { id: s.categoryId, name: s.categoryName }
          : null,
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

    // BoxClient checks this on the card and again beside the mutation,
    // but both are frontend: without this check, `cost` points and a
    // direct POST are enough to own a guardian whose category_id is NULL --
    // and NULL is what lets its owner send a real donation to any
    // category.
    //
    // The column, not `code === 'vip'`, which this was until 2026-11-21:
    // the codes name the species drawn and were renamed, which would have
    // switched the paywall off with nothing failing.
    //
    // Entitled, not active: a cancelled agreement inside the period it
    // already paid for still grants paid access, same rule guardian.ts
    // uses for the XP bonus.
    //
    // findEntitledSubscription and deliberately NOT hasPaidAccess: this
    // is the one paid feature BETA_MODE leaves closed. The egg is hidden
    // from /box under beta, which is the product decision, and this is
    // what makes it a decision rather than a suggestion -- the paragraph
    // above is the reason the UI cannot be the gate here.
    if (species.requiresSubscription) {
      const entitled = await findEntitledSubscription(db, user.id);
      if (entitled === undefined)
        throw new BadRequestError('subscription required for this guardian', 'SUBSCRIPTION_REQUIRED');
    }

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
