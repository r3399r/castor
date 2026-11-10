import { getDb } from 'src/db/client';
import { cleanOldData } from 'src/lib/housekeep';
import {
  cancelOrdersSupersededByDayPass,
  expireUnpaidPurchases,
} from 'src/lib/paymentSweep';

// Triggered directly by a daily EventBridge rule (no HTTP event to
// parse). Logged and swallowed rather than rethrown, same reasoning as
// facebook.ts -- a failed run just means tonight's cleanup is skipped,
// not a retry storm; it tries again tomorrow regardless.
//
// The three tasks are independent and each is wrapped separately, so a
// failure in one does not skip the others. That matters most for the
// payment sweep: it talks to ECPay, which rate-limits, while the data
// cleanup only touches our own database.
export const housekeep = async (): Promise<void> => {
  const db = getDb();

  for (const [name, task] of [
    ['cleanOldData', () => cleanOldData(db)],
    ['expireUnpaidPurchases', () => expireUnpaidPurchases(db)],
    // Last, and after the expiry pass, so it scans the smallest set.
    ['cancelOrdersSupersededByDayPass', () => cancelOrdersSupersededByDayPass(db)],
  ] as const) {
    try {
      await task();
    } catch (error) {
      console.error(`housekeep task ${name} failed`, error);
    }
  }
};
