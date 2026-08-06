import { eq, isNotNull } from 'drizzle-orm';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { questionTable, replyTable } from 'src/db/schema';

type Db = MySql2Database;

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
  const rows = await db
    .select({ questionId: replyTable.questionId, durationMs: replyTable.durationMs })
    .from(replyTable)
    .where(isNotNull(replyTable.durationMs));

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
