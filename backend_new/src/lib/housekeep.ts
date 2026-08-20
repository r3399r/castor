import { lt } from 'drizzle-orm';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { pendingReplyTable, replyTable } from 'src/db/schema';
import { recomputeQuestionDurationStats, recomputeSubjectDurationStats } from 'src/lib/questionStat';

type Db = MySql2Database;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const REPLY_MAX_AGE_MS = 365 * ONE_DAY_MS;
// pending_reply is transient "served but not yet answered" state, not
// history like reply -- a row that old just means the practice session
// was abandoned, so it's cleaned on a much shorter cutoff than reply.
const PENDING_REPLY_MAX_AGE_MS = 7 * ONE_DAY_MS;

/**
 * Daily cleanup of reply and pending_reply. Both use createdAt (not
 * repliedAt/updatedAt) as the age reference, matching the legacy
 * version's cutoff column.
 */
export const cleanOldData = async (db: Db): Promise<void> => {
  const now = Date.now();
  const replyCutoff = new Date(now - REPLY_MAX_AGE_MS);

  // Captured before deleting -- these questions'/subjects' duration
  // stats (question.durationP5Ms/durationMedianMs,
  // subject.durationMedianMs) were computed from data that's about to
  // disappear, so questionStat.ts's lookback-filtered nightly job won't
  // catch the change on its own (nothing "new" happened here, only
  // something old going away). Recomputing this exact set right after
  // the delete is what keeps those stats correct without the nightly job
  // having to rescan everything just in case something aged out.
  const expiringReplies = await db
    .select({ questionId: replyTable.questionId, subjectId: replyTable.subjectId })
    .from(replyTable)
    .where(lt(replyTable.createdAt, replyCutoff));
  const affectedQuestionIds = [...new Set(expiringReplies.map((r) => r.questionId))];
  const affectedSubjectIds = [...new Set(expiringReplies.map((r) => r.subjectId))];

  const [{ affectedRows: replyDeleted }] = await db.delete(replyTable).where(lt(replyTable.createdAt, replyCutoff));
  console.log(`Deleted ${replyDeleted} replies older than 1 year`);

  await recomputeQuestionDurationStats(db, affectedQuestionIds);
  await recomputeSubjectDurationStats(db, affectedSubjectIds);
  console.log(
    `Recomputed duration stats for ${affectedQuestionIds.length} questions, ${affectedSubjectIds.length} subjects affected by deletion`
  );

  const [{ affectedRows: pendingDeleted }] = await db
    .delete(pendingReplyTable)
    .where(lt(pendingReplyTable.createdAt, new Date(now - PENDING_REPLY_MAX_AGE_MS)));
  console.log(`Deleted ${pendingDeleted} pending replies older than 7 days`);
};
