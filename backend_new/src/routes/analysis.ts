import { zValidator } from '@hono/zod-validator';
import { and, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  conceptGroupTable,
  conceptTable,
  replyTable,
  subjectTable,
  userConceptStatTable,
  userStatHistoryTable,
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

const DEFAULT_WINDOW_DAYS = 90;
const MAX_WINDOW_DAYS = 365;

/**
 * Below this many timed answers in a subject, the user's own median is
 * too noisy to compare against anything, and deltaMs is withheld. The
 * rule lives here rather than in the client so there is one definition
 * of "comparable".
 */
const MIN_USER_SAMPLES = 5;

/**
 * Linear-interpolation percentile, deliberately identical to the one
 * questionStat.ts uses to compute subject.durationMedianMs.
 *
 * Both sides of this comparison have to be the same statistic: a
 * different method on the user's side would show a gap that is partly
 * just arithmetic.
 */
const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return Math.round(sorted[lower] * (upper - idx) + sorted[upper] * (idx - lower));
};

export const forgettingRiskQuerySchema = z.object({
  subjectId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export const speedQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_WINDOW_DAYS)
    .optional()
    .default(DEFAULT_WINDOW_DAYS),
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
  })
  /**
   * The caller's median seconds per question against the platform's,
   * per subject.
   */
  .get('/speed', zValidator('query', speedQuerySchema), async (c) => {
    const user = c.get('user');
    const { days } = c.req.valid('query');
    console.log(`GET /api/analysis/speed userId=${user.id} days=${days}`);
    const db = c.get('db');

    // user_stat_history's UNIQUE(user_id, subject_id, date) makes user_id
    // a usable index prefix. Naming the subjects explicitly below is what
    // keeps the reply query on idx_subject_user_created_at, which leads
    // with subject_id -- filtering reply by user alone could not use it.
    const subjectRows = await db
      .selectDistinct({ subjectId: userStatHistoryTable.subjectId })
      .from(userStatHistoryTable)
      .where(eq(userStatHistoryTable.userId, user.id));
    const subjectIds = subjectRows.map((r) => r.subjectId);
    if (subjectIds.length === 0) return c.json([]);

    const since = new Date(Date.now() - days * DAY_MS);
    const [replies, subjects] = await Promise.all([
      db
        .select({
          subjectId: replyTable.subjectId,
          durationMs: replyTable.durationMs,
          score: replyTable.score,
        })
        .from(replyTable)
        .where(
          and(
            inArray(replyTable.subjectId, subjectIds),
            eq(replyTable.userId, user.id),
            gte(replyTable.createdAt, since),
            isNotNull(replyTable.durationMs),
            // The same exclusion questionStat.ts applies when computing
            // the platform medians, so both sides are drawn from the
            // same population.
            eq(replyTable.tooFast, false)
          )
        ),
      db
        .select({
          id: subjectTable.id,
          name: subjectTable.name,
          durationMedianMs: subjectTable.durationMedianMs,
        })
        .from(subjectTable)
        .where(inArray(subjectTable.id, subjectIds)),
    ]);

    const bySubject = new Map<number, { durations: number[]; scoreSum: number }>();
    for (const reply of replies) {
      if (reply.durationMs === null) continue;
      const entry = bySubject.get(reply.subjectId) ?? { durations: [], scoreSum: 0 };
      entry.durations.push(reply.durationMs);
      entry.scoreSum += reply.score;
      bySubject.set(reply.subjectId, entry);
    }

    const items = subjects
      .map((subject) => {
        const entry = bySubject.get(subject.id);
        if (entry === undefined || entry.durations.length === 0) return undefined;

        const sorted = [...entry.durations].sort((a, b) => a - b);
        const userMedianMs = percentile(sorted, 0.5);
        const platformMedianMs = subject.durationMedianMs;
        // Withheld rather than guessed at: the platform median is NULL
        // until a subject has enough samples platform-wide, and the
        // user's own median means little off a handful of questions.
        const comparable =
          platformMedianMs !== null && entry.durations.length >= MIN_USER_SAMPLES;

        return {
          subjectId: subject.id,
          subject: subject.name,
          userMedianMs,
          platformMedianMs,
          deltaMs: comparable ? userMedianMs - platformMedianMs : null,
          // Scores are 0-10, so this is already a percentage. Reported
          // alongside speed because "fast" is only good news if the
          // answers were right.
          accuracy: (entry.scoreSum / entry.durations.length) * 10,
          sampleCount: entry.durations.length,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== undefined)
      .sort((a, b) => a.subject.localeCompare(b.subject));

    return c.json(items);
  });
