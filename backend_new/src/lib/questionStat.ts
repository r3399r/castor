import { and, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { durationGlobalStatTable, questionTable, replyTable, subjectTable } from 'src/db/schema';

type Db = MySql2Database;

// Runs nightly, but a question/subject with no new reply since the last
// run has an unchanged duration distribution *from that direction* -- it
// could still have shrunk from the other direction (Housekeep deleting
// old replies), but that's handled separately: housekeep.ts calls
// recomputeQuestionDurationStats/recomputeSubjectDurationStats directly
// for exactly whatever it just deleted, right after deleting. So "no new
// reply" here really does mean "unchanged", and recomputing anyway would
// be wasted work. 2 days (not 1) gives one day of overlap in case a run
// is missed or runs late, so a question/subject's stats never go more
// than one missed run stale on the new-data side. This only narrows
// *which* entities get reprocessed -- each one still pulls its *entire*
// reply history in the recompute functions below, not just the last 2
// days, so the percentile itself stays the same statistic (just computed
// less often), not a noisier rolling one.
const LOOKBACK_DAYS = 2;

// Below this many duration samples, a computed median is too noisy to
// trust -- a handful of replies can swing wildly depending on who
// happened to answer, especially for a brand-new or low-traffic
// question/subject. Below the threshold, durationMedianMs is written as
// NULL rather than an unstable value -- reply.ts's time-weight formula
// treats NULL as neutral (no adjustment), not zero. Question-level is
// lower than subject-level since a single question naturally accumulates
// replies far more slowly than a whole subject's worth of questions
// combined.
const MIN_QUESTION_SAMPLES = 10;
const MIN_SUBJECT_SAMPLES = 30;

// Linear-interpolation percentile (same method numpy.percentile defaults
// to) -- MySQL has no PERCENTILE_CONT/DISC, and the per-question row
// counts here are small enough that sorting in application code is
// simpler than approximating it with PERCENT_RANK/NTILE window functions.
const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return Math.round(sorted[lower] * (upper - idx) + sorted[upper] * (idx - lower));
};

/**
 * Recomputes duration_p5_ms/duration_median_ms for exactly the given
 * question ids, from whatever reply history currently exists for each.
 * Shared by computeQuestionStats (triggered by *new* replies, below) and
 * housekeep.ts's cleanOldData (triggered by *deleted* replies) -- both
 * "this question's data changed" signals converge on the same
 * correct-from-current-data computation, so a question whose duration
 * history changes for either reason ends up with the same answer. Every
 * requested id gets written, even ones with zero remaining duration data
 * (e.g. every duration-tracked reply to it just got deleted) -- those
 * get explicitly reset to NULL rather than left stale. Excludes
 * tooFast=true replies -- reply.ts already zeroed their own points, but
 * without this exclusion their durations would still drag the computed
 * percentiles down, gradually lowering the very durationP5Ms threshold
 * used to flag future too-fast replies.
 */
export const recomputeQuestionDurationStats = async (db: Db, questionIds: number[]): Promise<number> => {
  if (questionIds.length === 0) return 0;

  const rows = await db
    .select({ questionId: replyTable.questionId, durationMs: replyTable.durationMs })
    .from(replyTable)
    .where(
      and(
        isNotNull(replyTable.durationMs),
        eq(replyTable.tooFast, false),
        inArray(replyTable.questionId, questionIds)
      )
    );

  const durationsByQuestion = new Map<number, number[]>();
  for (const row of rows) {
    const list = durationsByQuestion.get(row.questionId) ?? [];
    list.push(row.durationMs!);
    durationsByQuestion.set(row.questionId, list);
  }

  for (const questionId of questionIds) {
    const durations = durationsByQuestion.get(questionId);
    const sorted = durations ? [...durations].sort((a, b) => a - b) : [];
    await db
      .update(questionTable)
      .set({
        durationP5Ms: sorted.length > 0 ? percentile(sorted, 0.05) : null,
        durationMedianMs: sorted.length >= MIN_QUESTION_SAMPLES ? percentile(sorted, 0.5) : null,
      })
      .where(eq(questionTable.id, questionId));
  }

  return questionIds.length;
};

/**
 * Same shared-recompute shape as recomputeQuestionDurationStats, one
 * level up -- subject.durationMedianMs across exactly the given subject
 * ids, from whatever reply history currently exists for each. Same
 * tooFast exclusion for the same reason.
 */
export const recomputeSubjectDurationStats = async (db: Db, subjectIds: number[]): Promise<number> => {
  if (subjectIds.length === 0) return 0;

  const rows = await db
    .select({ subjectId: replyTable.subjectId, durationMs: replyTable.durationMs })
    .from(replyTable)
    .where(
      and(isNotNull(replyTable.durationMs), eq(replyTable.tooFast, false), inArray(replyTable.subjectId, subjectIds))
    );

  const durationsBySubject = new Map<number, number[]>();
  for (const row of rows) {
    const list = durationsBySubject.get(row.subjectId) ?? [];
    list.push(row.durationMs!);
    durationsBySubject.set(row.subjectId, list);
  }

  for (const subjectId of subjectIds) {
    const durations = durationsBySubject.get(subjectId);
    const durationMedianMs =
      durations && durations.length >= MIN_SUBJECT_SAMPLES
        ? percentile([...durations].sort((a, b) => a - b), 0.5)
        : null;
    await db.update(subjectTable).set({ durationMedianMs }).where(eq(subjectTable.id, subjectId));
  }

  return subjectIds.length;
};

/**
 * The single platform-wide duration_global_stat row -- always a full
 * recompute (not lookback-filtered, not id-scoped like the two functions
 * above). Unlike question/subject, there's no natural "which ids changed"
 * scope for a single platform-wide value, and an active platform will
 * almost always have *some* recent activity anyway, so gating this the
 * same way wouldn't save much. Revisit by deriving it from subject
 * medians instead of rescanning reply if this scan ever becomes the
 * bottleneck -- not done here since that trades away exactness for a
 * cost that hasn't mattered yet. Same tooFast exclusion as the two
 * functions above, for the same reason.
 */
export const recomputeGlobalDurationStat = async (db: Db): Promise<void> => {
  const rows = await db
    .select({ durationMs: replyTable.durationMs })
    .from(replyTable)
    .where(and(isNotNull(replyTable.durationMs), eq(replyTable.tooFast, false)));
  if (rows.length === 0) return;

  const sorted = rows.map((r) => r.durationMs!).sort((a, b) => a - b);
  const medianMs = percentile(sorted, 0.5);
  const [existing] = await db.select({ id: durationGlobalStatTable.id }).from(durationGlobalStatTable);
  if (existing) {
    await db.update(durationGlobalStatTable).set({ medianMs }).where(eq(durationGlobalStatTable.id, existing.id));
  } else {
    await db.insert(durationGlobalStatTable).values({ medianMs });
  }
};

/**
 * Daily recompute of duration statistics for whatever changed since the
 * last run via *new* replies (see housekeep.ts's cleanOldData for the
 * complementary *deleted*-replies path), at the three levels reply.ts's
 * points time-weight combines:
 *  - question.durationP5Ms / durationMedianMs -- this question vs its own
 *    history (P5 feeds the anti-farming check, median feeds time-weight).
 *  - subject.durationMedianMs -- this subject vs the platform overall.
 *  - duration_global_stat -- the single platform-wide anchor the above
 *    two are compared against.
 */
export const computeQuestionStats = async (db: Db): Promise<void> => {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const recentRows = await db
    .select({ questionId: replyTable.questionId, subjectId: replyTable.subjectId })
    .from(replyTable)
    .where(and(isNotNull(replyTable.durationMs), gte(replyTable.repliedAt, since)));

  const recentQuestionIds = [...new Set(recentRows.map((r) => r.questionId))];
  const recentSubjectIds = [...new Set(recentRows.map((r) => r.subjectId))];

  const questionsUpdated = await recomputeQuestionDurationStats(db, recentQuestionIds);
  const subjectsUpdated = await recomputeSubjectDurationStats(db, recentSubjectIds);
  await recomputeGlobalDurationStat(db);

  console.log(`Recomputed duration stats: ${questionsUpdated} questions, ${subjectsUpdated} subjects`);
};
