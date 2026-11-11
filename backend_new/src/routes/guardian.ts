import { zValidator } from '@hono/zod-validator';
import { and, eq, sql } from 'drizzle-orm';
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
import { LEVEL_XP_THRESHOLDS, MAX_LEVEL, investmentXp, nextLevelXp } from 'src/lib/guardianLevel';
import { findEntitledSubscription } from 'src/lib/subscription';
import { BadRequestError, NotFoundError } from 'src/model/error';
import { UserEnv } from 'src/middleware/requireUser';

export const investBodySchema = z.object({ points: z.number().int().positive() });

const categorySchema = z.object({ id: z.number().int(), name: z.string() });

/**
 * A spirit as this API reports it.
 *
 * A schema rather than a hand-written type, because it is the single
 * description of the response: the handler's return is checked against
 * it, the OpenAPI document is generated from it, and the DTO type below
 * is inferred from it. A type beside a separately written document is two
 * things that drift.
 *
 * `.describe()` is not a comment -- it reaches the generated document,
 * and so reaches whoever writes a client against it.
 */
const guardianSchema = z.object({
  id: z.number().int(),
  guardianId: z.number().int(),
  code: z.string(),
  name: z.string(),
  theme: z.string(),
  level: z.number().int(),
  xp: z.number().int(),
  nextLevelXp: z
    .number()
    .int()
    .nullable()
    .describe('XP this spirit still needs for its next level, or null at the maximum'),
  /**
   * Null for a species tied to no category -- which is what VIP is, and
   * what lets its owner direct the donation at any category.
   *
   * Carried here because the LV5 donation screen is per spirit: it has to
   * list that category's organisations, and `theme` is only a display
   * label (it reads the same as the category's name today and will
   * diverge once one category holds several eggs).
   */
  category: categorySchema
    .nullable()
    .describe('The public-interest category this species supports, or null for one tied to none'),
});

export const getGuardianResponseSchema = z.object({
  data: z.array(guardianSchema),
  totalPoints: z.number().int(),
});

export const postGuardianInvestResponseSchema = z.object({
  guardian: guardianSchema,
  totalPoints: z.number().int(),
  xpGained: z.number().int().describe('XP actually granted, growth bonus included'),
});

type GuardianDto = z.infer<typeof guardianSchema>;

/**
 * The OpenAPI entries for the two routes below.
 *
 * Hoisted out of the route definitions so the handlers keep their own
 * indentation and the route lines stay one line each; `describeRoute` is
 * middleware, so where it is constructed makes no difference.
 */
const listDoc = describeRoute({
  summary: "List the caller's spirits",
  description: "Every spirit this user owns, with the caller's point balance.",
  tags: ['guardian'],
  responses: {
    200: {
      description: 'The spirits and the balance',
      content: { 'application/json': { schema: resolver(getGuardianResponseSchema) } },
    },
  },
});

const investDoc = describeRoute({
  summary: 'Invest points into a spirit',
  description:
    'Spends the full `points` and adds XP, levelling the spirit up as many times as the XP covers. Paid access earns a growth bonus, which the server decides for itself from the caller\'s entitlement -- the request body cannot ask for it.',
  tags: ['guardian'],
  responses: {
    200: {
      description: 'The spirit after the investment, the new balance, and the XP granted',
      content: { 'application/json': { schema: resolver(postGuardianInvestResponseSchema) } },
    },
    400: { description: 'Already at the maximum level, or not enough points' },
    404: { description: 'No such spirit belongs to this caller' },
  },
});

const toDto = (row: {
  id: number;
  guardianId: number;
  code: string;
  name: string;
  theme: string;
  level: number;
  xp: number;
  categoryId: number | null;
  categoryName: string | null;
}): GuardianDto => {
  const { categoryId, categoryName, ...rest } = row;
  return {
    ...rest,
    nextLevelXp: nextLevelXp(rest.level),
    category:
      categoryId !== null && categoryName !== null
        ? { id: categoryId, name: categoryName }
        : null,
  };
};

export const guardian = new Hono<UserEnv>()
  .get('/', listDoc, async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    console.log(`GET /api/guardian userId=${user.id}`);

    const rows = await db
      .select({
        id: userGuardianTable.id,
        guardianId: userGuardianTable.guardianId,
        code: guardianTable.code,
        name: guardianTable.name,
        theme: guardianTable.theme,
        level: userGuardianTable.level,
        xp: userGuardianTable.xp,
        categoryId: charityCategoryTable.id,
        categoryName: charityCategoryTable.name,
      })
      .from(userGuardianTable)
      .innerJoin(guardianTable, eq(guardianTable.id, userGuardianTable.guardianId))
      // Left, not inner: guardian.categoryId is NULL for a species tied to
      // no category, and an inner join would drop that spirit out of the
      // owner's own collection entirely.
      .leftJoin(charityCategoryTable, eq(charityCategoryTable.id, guardianTable.categoryId))
      .where(eq(userGuardianTable.userId, user.id));

    return c.json({
      data: rows.map(toDto),
      totalPoints: user.totalPoints,
    } satisfies z.infer<typeof getGuardianResponseSchema>);
  })
  .post('/:id/invest', investDoc, zValidator('json', investBodySchema), async (c) => {
    const id = Number(c.req.param('id'));
    const { points } = c.req.valid('json');
    const user = c.get('user');
    const db = c.get('db');
    console.log(`POST /api/guardian/${id}/invest userId=${user.id} points=${points}`);

    // Scoped to the requesting user, not just the row id -- same 404 (not
    // 403) posture as wrongQuestion.ts, so this never confirms to a
    // caller that a given id belongs to someone else.
    const [existing] = await db
      .select({
        id: userGuardianTable.id,
        level: userGuardianTable.level,
        xp: userGuardianTable.xp,
        guardianId: userGuardianTable.guardianId,
        code: guardianTable.code,
        name: guardianTable.name,
        theme: guardianTable.theme,
        categoryId: charityCategoryTable.id,
        categoryName: charityCategoryTable.name,
      })
      .from(userGuardianTable)
      .innerJoin(guardianTable, eq(guardianTable.id, userGuardianTable.guardianId))
      // Left, for the same reason as the list above: a species tied to no
      // category must not vanish from its owner's own invest call.
      .leftJoin(charityCategoryTable, eq(charityCategoryTable.id, guardianTable.categoryId))
      .where(and(eq(userGuardianTable.id, id), eq(userGuardianTable.userId, user.id)));
    if (existing === undefined) throw new NotFoundError(`guardian ${id} not found`);
    if (existing.level >= MAX_LEVEL) throw new BadRequestError('guardian is already at max level', 'ALREADY_MAX_LEVEL');
    if (user.totalPoints < points) throw new BadRequestError('insufficient points', 'INSUFFICIENT_POINTS');

    // Paid access earns the growth bonus the box and subscription pages
    // promise. Read here rather than taken from the client: the request
    // body carries only `points`, and the bonus is value being granted,
    // so the only acceptable source is the server's own entitlement
    // lookup. findEntitledSubscription, not findActiveSubscription --
    // the same question requireSubscription asks, so a cancelled
    // agreement still inside its paid period earns it, and a day pass
    // does too.
    const entitled = await findEntitledSubscription(db, user.id);
    const xpGained = investmentXp(points, entitled !== undefined);

    // Every invested point becomes at least 1 xp, plus the bonus above.
    // Levels up as many times as the xp covers in one call (a single
    // large investment can jump multiple levels). Once MAX_LEVEL is
    // reached, any xp beyond the final threshold is simply not tracked
    // further -- there's no level left for it to count toward, and
    // further invests are rejected above once level === MAX_LEVEL, so it
    // could never be spent anyway. The full requested `points` is still
    // deducted regardless (no partial refund for that discarded
    // remainder, and the bonus is never a discount) -- matches this
    // codebase's other spends, which never partially fail once the
    // up-front checks pass.
    let level = existing.level;
    let xp = existing.xp + xpGained;
    while (level < MAX_LEVEL && xp >= LEVEL_XP_THRESHOLDS[level - 1]) {
      xp -= LEVEL_XP_THRESHOLDS[level - 1];
      level++;
    }
    if (level === MAX_LEVEL) xp = 0;

    const now = new Date();
    await db.update(userGuardianTable).set({ level, xp, updatedAt: now }).where(eq(userGuardianTable.id, id));

    // Spending only decrements totalPoints, never lifetimePoints -- same
    // split store.ts's redeem uses, so investing never hurts leaderboard
    // rank.
    const newTotalPoints = user.totalPoints - points;
    await db
      .update(userTable)
      .set({ totalPoints: sql`${userTable.totalPoints} - ${points}`, updatedAt: now })
      .where(eq(userTable.id, user.id));

    await db.insert(pointTransactionTable).values({
      userId: user.id,
      type: 'SPEND_GUARDIAN_INVEST',
      amount: -points,
      balanceAfter: newTotalPoints,
      createdAt: now,
    });

    return c.json({
      guardian: toDto({
        id: existing.id,
        guardianId: existing.guardianId,
        code: existing.code,
        name: existing.name,
        theme: existing.theme,
        categoryId: existing.categoryId,
        categoryName: existing.categoryName,
        level,
        xp,
      }),
      totalPoints: newTotalPoints,
      // What was actually granted, so the client can state the outcome
      // instead of re-deriving it from a rate it would have to keep in
      // step with the server's rounding.
      xpGained,
    } satisfies z.infer<typeof postGuardianInvestResponseSchema>);
  });
