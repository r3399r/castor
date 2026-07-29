import { getDb } from 'src/db/client';
import { processNextQuestion } from 'src/lib/facebookPoster';

// Triggered directly by the EventBridge rule (no HTTP event to parse) --
// a failure here is logged and swallowed rather than rethrown, so a
// transient Facebook/S3 hiccup doesn't turn into a Lambda-retry storm or
// a CloudWatch alarm; the rule fires again in 10 minutes regardless.
export const facebook = async (): Promise<void> => {
  try {
    await processNextQuestion(getDb());
  } catch (error) {
    console.error('facebook lambda failed', error);
  }
};
