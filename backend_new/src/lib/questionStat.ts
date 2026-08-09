import { and, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { questionTable, replyTable } from 'src/db/schema';

type Db = MySql2Database;

// Runs nightly, but a question with no new reply since the last run has
// an unchanged duration distribution -- its p5 can't have moved, so
// recomputing it is wasted work. 2 days (not 1) gives one day of overlap
// in case a run is missed or runs late, so a question's stats never go
// more than one missed run stale. This only narrows *which* questions
// get reprocessed -- each one still pulls its *entire* reply history
// below, not just the last 2 days, so the percentile itself stays the
// same statistic (just computed less often), not a noisier rolling one.
const LOOKBACK_DAYS = 2;

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
 * Daily recompute of question-level statistics derived from reply
 * history. Currently just question.durationP5Ms (the 5th percentile of
 * reply.durationMs across every reply to that question, GROUP children
 * counted individually, same as attemptCount/scoringTotal) -- named
 * generically since more question-level stats are expected to land here
 * over time rather than each getting their own job.
 */
export const computeQuestionStats = async (db: Db): Promise<void> => {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const recentRows = await db
    .select({ questionId: replyTable.questionId })
    .from(replyTable)
    .where(and(isNotNull(replyTable.durationMs), gte(replyTable.repliedAt, since)));
  const recentQuestionIds = [...new Set(recentRows.map((r) => r.questionId))];

  if (recentQuestionIds.length === 0) {
    console.log('Recomputed question stats for 0 questions (none replied recently)');
    return;
  }

  const rows = await db
    .select({ questionId: replyTable.questionId, durationMs: replyTable.durationMs })
    .from(replyTable)
    .where(and(isNotNull(replyTable.durationMs), inArray(replyTable.questionId, recentQuestionIds)));

  const durationsByQuestion = new Map<number, number[]>();
  for (const row of rows) {
    const list = durationsByQuestion.get(row.questionId) ?? [];
    list.push(row.durationMs!);
    durationsByQuestion.set(row.questionId, list);
  }

  for (const [questionId, durations] of durationsByQuestion) {
    durations.sort((a, b) => a - b);
    await db
      .update(questionTable)
      .set({ durationP5Ms: percentile(durations, 0.05) })
      .where(eq(questionTable.id, questionId));
  }

  console.log(`Recomputed question stats for ${durationsByQuestion.size} questions`);
};
