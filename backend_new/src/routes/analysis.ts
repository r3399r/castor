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
import {
  buildDateSubjectMap,
  buildOverallDailyMastery,
  buildSubjectHistory,
  loadMasteryHistoryRows,
  loadSubjectWeights,
} from 'src/lib/masteryHistory';
import { SubscriptionEnv } from 'src/middleware/requireSubscription';

type Db = SubscriptionEnv['Variables']['db'];

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Forgetting model ────────────────────────────────────────────────────────

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
 * numbers in this file -- everything else is measured. They are named
 * constants precisely so they are the first thing to reach for when the
 * ordering looks wrong against real study habits.
 */
const MASTERY_STRENGTH_MULTIPLIER = 2;

const RISK_HIGH_BELOW = 0.5;
const RISK_MEDIUM_BELOW = 0.75;

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

// ─── Speed comparison ────────────────────────────────────────────────────────

/** Default span of reply history the speed comparison draws on. */
const DEFAULT_SPEED_DAYS = 90;

/** Shared upper bound for both day-range parameters. */
const MAX_WINDOW_DAYS = 365;

/** Matches the widest range tab the analysis page offers. */
const DEFAULT_PROGRESS_DAYS = 90;

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

// ─── Loaders ─────────────────────────────────────────────────────────────────

/**
 * Concepts most likely to have been forgotten, most urgent first.
 *
 * Everything but the decay curve is read straight off user_concept_stat
 * -- no reply replay and no new storage, so the cost is one indexed read
 * regardless of how much the user has practised.
 */
const loadForgettingRisk = async (db: Db, userId: number, limit: number) => {
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
    .where(
      and(
        eq(userConceptStatTable.userId, userId),
        // A concept never attempted has nothing to forget, and no date
        // to measure from.
        isNotNull(userConceptStatTable.lastAttemptAt),
        isNotNull(userConceptStatTable.mastery)
      )
    );

  const now = Date.now();
  return rows
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
};

/**
 * The user's median seconds per question against the platform's, per
 * subject.
 */
const loadSpeedComparison = async (db: Db, userId: number, speedDays: number) => {
  // user_stat_history's UNIQUE(user_id, subject_id, date) makes user_id a
  // usable index prefix. Naming the subjects explicitly below is what
  // keeps the reply query on idx_subject_user_created_at, which leads
  // with subject_id -- filtering reply by user alone could not use it.
  const subjectRows = await db
    .selectDistinct({ subjectId: userStatHistoryTable.subjectId })
    .from(userStatHistoryTable)
    .where(eq(userStatHistoryTable.userId, userId));
  const subjectIds = subjectRows.map((r) => r.subjectId);
  if (subjectIds.length === 0) return [];

  const since = new Date(Date.now() - speedDays * DAY_MS);
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
          eq(replyTable.userId, userId),
          gte(replyTable.createdAt, since),
          isNotNull(replyTable.durationMs),
          // The same exclusion questionStat.ts applies when computing
          // the platform medians, so both sides are drawn from the same
          // population.
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

  return subjects
    .map((subject) => {
      const entry = bySubject.get(subject.id);
      if (entry === undefined || entry.durations.length === 0) return undefined;

      const sorted = [...entry.durations].sort((a, b) => a - b);
      const userMedianMs = percentile(sorted, 0.5);
      const platformMedianMs = subject.durationMedianMs;
      // Withheld rather than guessed at: the platform median is NULL
      // until a subject has enough samples platform-wide, and the user's
      // own median means little off a handful of questions.
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
};

/**
 * Trims a filled series to its last `days` points.
 *
 * A slice of the *completed* series, deliberately not a windowed query:
 * filling from a cutoff date would start the carry-forward at zero and
 * invent a climb out of nothing for anyone whose practice predates the
 * window. Building the whole series first means the first day in view
 * already carries the value it inherited.
 */
const takeRecentDays = <T,>(points: T[], days: number): T[] =>
  points.slice(Math.max(0, points.length - days));

/**
 * Mastery over time, overall and split by subject.
 *
 * Bounded by `progressDays` rather than returning all history: the
 * client's range tabs filter in place (so a tab switch is not a round
 * trip), but it can only ever draw as far back as its widest tab, and a
 * long-standing user's full series is otherwise unbounded. The caller
 * asks for the range it can display, so widening a tab is a visible
 * change here rather than silent truncation. Distinct from speedDays,
 * which bounds a different thing entirely.
 */
const loadProgress = async (db: Db, userId: number, progressDays: number) => {
  const rows = await loadMasteryHistoryRows(db, userId);
  if (rows.length === 0) return { overall: [], subjects: [] };

  const subjectIds = [...new Set(rows.map((r) => r.subjectId))];
  const { nameById, questionCountById } = await loadSubjectWeights(db, subjectIds);

  return {
    overall: takeRecentDays(
      buildOverallDailyMastery(buildDateSubjectMap(rows), questionCountById),
      progressDays
    ),
    subjects: buildSubjectHistory(rows, nameById).map((subject) => ({
      ...subject,
      dailyStats: takeRecentDays(subject.dailyStats, progressDays),
    })),
  };
};

// ─── Route ───────────────────────────────────────────────────────────────────

export const overviewQuerySchema = z.object({
  // Named for what it bounds. The two spans answer different
  // questions -- how far back to measure answer times, versus how much
  // of the mastery curve to draw -- and a bare `days` beside
  // progressDays read as though it governed both.
  speedDays: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_WINDOW_DAYS)
    .optional()
    .default(DEFAULT_SPEED_DAYS),
  riskLimit: z.coerce.number().int().positive().max(100).optional().default(20),
  progressDays: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_WINDOW_DAYS)
    .optional()
    .default(DEFAULT_PROGRESS_DAYS),
});

export const analysis = new Hono<SubscriptionEnv>()
  /**
   * Everything the subscriber-only part of the analysis page needs, in
   * one request.
   *
   * One endpoint rather than two because both halves share a gate, a
   * page section and a lifecycle -- the client would never want one
   * without the other, and four requests on a page load is three
   * Lambda invocations and three token verifications more than it has
   * to be. The two queries are independent, so they run concurrently
   * and the response is no slower than the slower of them.
   *
   * Deliberately NOT merged with the free /user/stats and /user/history:
   * those sit behind requireUser, and folding them in would mean
   * demoting this route to requireUser and deciding entitlement with an
   * `if` inside the handler. A forgotten `if` leaks paid data silently,
   * where a forgotten middleware fails loudly -- not a trade worth one
   * fewer request.
   */
  .get('/overview', zValidator('query', overviewQuerySchema), async (c) => {
    const user = c.get('user');
    const { speedDays, riskLimit, progressDays } = c.req.valid('query');
    console.log(
      `GET /api/analysis/overview userId=${user.id} speedDays=${speedDays} riskLimit=${riskLimit} progressDays=${progressDays}`
    );
    const db = c.get('db');

    const [progress, forgettingRisk, speed] = await Promise.all([
      loadProgress(db, user.id, progressDays),
      loadForgettingRisk(db, user.id, riskLimit),
      loadSpeedComparison(db, user.id, speedDays),
    ]);

    return c.json({ progress, forgettingRisk, speed });
  });
