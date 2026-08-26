import { zValidator } from '@hono/zod-validator';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { guardianTable, pointTransactionTable, userGuardianTable, userTable } from 'src/db/schema';
import { BadRequestError, NotFoundError } from 'src/model/error';
import { UserEnv } from 'src/middleware/requireUser';

export const redeemBodySchema = z.object({ speciesId: z.number().int().positive() });

type GuardianSpeciesDto = {
  id: number;
  code: string;
  name: string;
  theme: string;
  cost: number;
  owned: boolean;
};

export const store = new Hono<UserEnv>()
  .get('/species', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    console.log(`GET /api/store/species userId=${user.id}`);

    const species = await db
      .select()
      .from(guardianTable)
      .where(eq(guardianTable.isActive, true))
      .orderBy(asc(guardianTable.sortOrder));

    const owned = await db
      .select({ guardianId: userGuardianTable.guardianId })
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
    const ownedSpeciesIds = new Set(owned.map((o) => o.guardianId));

    const data: GuardianSpeciesDto[] = species.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      theme: s.theme,
      cost: s.cost,
      owned: ownedSpeciesIds.has(s.id),
    }));

    return c.json({ data, totalPoints: user.totalPoints });
  })
  .post('/redeem', zValidator('json', redeemBodySchema), async (c) => {
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
    });
  });
