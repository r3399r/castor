import { getDb } from 'src/db/client';
import { cleanOldData } from 'src/lib/housekeep';

// Triggered directly by a daily EventBridge rule (no HTTP event to
// parse). Logged and swallowed rather than rethrown, same reasoning as
// facebook.ts -- a failed run just means tonight's cleanup is skipped,
// not a retry storm; it tries again tomorrow regardless.
export const housekeep = async (): Promise<void> => {
  try {
    await cleanOldData(getDb());
  } catch (error) {
    console.error('housekeep lambda failed', error);
  }
};
