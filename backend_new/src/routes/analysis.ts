import { zValidator } from '@hono/zod-validator';
import { and, eq, isNotNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  conceptGroupTable,
  conceptTable,
  subjectTable,
  userConceptStatTable,
} from 'src/db/schema';
import { SubscriptionEnv } from 'src/middleware/requireSubscription';

/**
 * Base e-folding period for forgetting, in days.
 *
 * Not a new invention: this is the same 7-day constant POST /reply
 * already uses to decay a concept's recent-performance weighting
 * (`Math.exp(-deltaDays / 7)` in reply.ts). Reusing it keeps the risk
 * shown here consistent with the mastery the rest of the product
 * reports, rather than introducing a second, differently-shaped notion
 * of going stale.
 */
const FORGETTING_BASE_DAYS = 7;

/**
 * How much mastery slows forgetting. At mastery 0 a concept decays on
 * the 7-day base; at mastery 10 it takes three times as long.
 *
 * This multiplier and the two thresholds below are the only modelled
 * numbers in this endpoint -- everything else is measured. They are
 * named constants precisely so they are the first thing to reach for
 * when the ordering looks wrong against real study habits.
 */
const MASTERY_STRENGTH_MULTIPLIER = 2;

const RISK_HIGH_BELOW = 0.5;
const RISK_MEDIUM_BELOW = 0.75;

const DAY_MS = 24 * 60 * 60 * 1000;

export type RiskLevel = 'high' | 'medium' | 'low';

/**
 * Probability the concept is still recallable now, 0-1.
 *
 * Ebbinghaus-shaped: exponential decay since the last attempt, with a
 * strength that grows with how well the concept was known.
 */
const retentionOf = (mastery: number, daysSinceReview: number): number => {
  const strengthDays =
    FORGETTING_BASE_DAYS * (1 + (mastery / 10) * MASTERY_STRENGTH_MULTIPLIER);
  return Math.exp(-daysSinceReview / strengthDays);
};

const riskLevelOf = (retention: number): RiskLevel =>
  retention < RISK_HIGH_BELOW ? 'high' : retention < RISK_MEDIUM_BELOW ? 'medium' : 'low';

export const forgettingRiskQuerySchema = z.object({
  subjectId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export const analysis = new Hono<SubscriptionEnv>()
  /**
   * Concepts most likely to have been forgotten, most urgent first.
   *
   * Everything but the decay curve is read straight off
   * user_concept_stat -- no reply replay and no new storage, so the cost
   * is one indexed read regardless of how much the user has practised.
   */
  .get('/forgetting-risk', zValidator('query', forgettingRiskQuerySchema), async (c) => {
    const user = c.get('user');
    const { subjectId, limit } = c.req.valid('query');
    console.log(
      `GET /api/analysis/forgetting-risk userId=${user.id} subjectId=${subjectId ?? 'all'} limit=${limit}`
    );
    const db = c.get('db');

    const conditions = [
      eq(userConceptStatTable.userId, user.id),
      // A concept never attempted has nothing to forget, and no date to
      // measure from.
      isNotNull(userConceptStatTable.lastAttemptAt),
      isNotNull(userConceptStatTable.mastery),
    ];
    if (subjectId !== undefined) conditions.push(eq(conceptGroupTable.subjectId, subjectId));

    const rows = await db
      .select({
        conceptId: userConceptStatTable.conceptId,
        concept: conceptTable.name,
        subjectId: conceptGroupTable.subjectId,
        subject: subjectTable.name,
        mastery: userConceptStatTable.mastery,
        lastAttemptAt: userConceptStatTable.lastAttemptAt,
        attemptCount: userConceptStatTable.attemptCount,
      })
      .from(userConceptStatTable)
      .innerJoin(conceptTable, eq(conceptTable.id, userConceptStatTable.conceptId))
      .innerJoin(conceptGroupTable, eq(conceptGroupTable.id, conceptTable.conceptGroupId))
      .innerJoin(subjectTable, eq(subjectTable.id, conceptGroupTable.subjectId))
      .where(and(...conditions));

    const now = Date.now();
    const items = rows
      .map((row) => {
        const mastery = row.mastery ?? 0;
        const daysSinceReview = Math.max(
          0,
          Math.floor((now - (row.lastAttemptAt?.getTime() ?? now)) / DAY_MS)
        );
        const retention = retentionOf(mastery, daysSinceReview);
        return {
          conceptId: row.conceptId,
          concept: row.concept,
          subjectId: row.subjectId,
          subject: row.subject,
          mastery,
          attemptCount: row.attemptCount,
          lastAttemptAt: row.lastAttemptAt,
          daysSinceReview,
          retention,
          level: riskLevelOf(retention),
        };
      })
      // Sorted here rather than in SQL: retention is computed from
      // lastAttemptAt and mastery together, so the database could only
      // order by it by recomputing the same curve in SQL.
      .sort((a, b) => a.retention - b.retention)
      .slice(0, limit);

    return c.json(items);
  });
