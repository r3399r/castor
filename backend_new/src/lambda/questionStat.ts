import { getDb } from 'src/db/client';
import { computeQuestionStats } from 'src/lib/questionStat';

// Triggered directly by a daily EventBridge rule (no HTTP event to
// parse). Logged and swallowed rather than rethrown, same reasoning as
// housekeep.ts -- a failed run just means tonight's recompute is
// skipped, not a retry storm; it tries again tomorrow regardless.
export const questionStat = async (): Promise<void> => {
  try {
    await computeQuestionStats(getDb());
  } catch (error) {
    console.error('questionStat lambda failed', error);
  }
};
