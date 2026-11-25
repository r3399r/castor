import type { ScoreOutcome } from '@/lib/scoreOutcome'
import styles from './reply.module.css'

/**
 * The card tones the two tabs share, keyed by the three outcomes in
 * lib/scoreOutcome.
 *
 * Shared rather than declared in each tab, because the whole point of the
 * three states is that 歷史紀錄 and 錯題本 stop contradicting each other:
 * a 7-of-10 answer must not read as 答對 on one tab while sitting in the
 * other. Two local copies of this mapping is how that drifts back.
 *
 * 錯題本 only ever holds rows scored below full marks (upsertWrongQuestion
 * is called under a `score < 10` guard), so `correct` never comes up
 * there -- it is mapped anyway so the record is total and the tab cannot
 * break if that ever changes.
 */
export const statusTone: Record<ScoreOutcome, string> = {
  correct: styles.statusCorrect,
  partial: styles.statusPartial,
  wrong: styles.statusWrong,
}

export const valueTone: Record<ScoreOutcome, string> = {
  correct: styles.valueCorrect,
  partial: styles.valuePartial,
  wrong: styles.valueWrong,
}
