import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from 'src/db/client';
import {
  examSubjectTable,
  examTable,
  pendingReplyTable,
  questionTable,
  replyTable,
  subjectTable,
  userTable,
} from 'src/db/schema';
import { cleanOldData } from 'src/lib/housekeep';

const seedQuestion = async (subjectId: number) => {
  const db = getDb();
  const now = new Date();
  const [{ insertId: questionId }] = await db.insert(questionTable).values({
    uuid: crypto.randomUUID(),
    subjectId,
    isGroup: false,
    type: 'SINGLE',
    content: 'q',
    options: 'A|B',
    answer: 'A',
    difficulty: 5,
    adjustedDifficulty: 5,
    createdAt: now,
    updatedAt: now,
  });
  return questionId;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const clearTables = async () => {
  const db = getDb();
  await db.delete(pendingReplyTable);
  await db.delete(replyTable);
  await db.update(questionTable).set({ parentId: null });
  await db.delete(questionTable);
  await db.delete(examSubjectTable);
  await db.delete(examTable);
  await db.delete(subjectTable);
  await db.delete(userTable);
};

const seedFixture = async () => {
  const db = getDb();
  const [{ insertId: userId }] = await db
    .insert(userTable)
    .values({ firebaseUid: 'fixture-uid', createdAt: new Date(), updatedAt: new Date() });
  const [{ insertId: subjectId }] = await db.insert(subjectTable).values({ name: 'fixture subject', createdAt: new Date() });
  const [{ insertId: examId }] = await db.insert(examTable).values({ name: 'fixture exam', createdAt: new Date() });
  await db.insert(examSubjectTable).values({ examId, subjectId });
  const now = new Date();
  const [{ insertId: questionId }] = await db.insert(questionTable).values({
    uuid: crypto.randomUUID(),
    subjectId,
    isGroup: false,
    type: 'SINGLE',
    content: 'q',
    options: 'A|B',
    answer: 'A',
    difficulty: 5,
    adjustedDifficulty: 5,
    createdAt: now,
    updatedAt: now,
  });
  return { userId, subjectId, questionId };
};

const insertReply = async (
  userId: number,
  subjectId: number,
  questionId: number,
  createdAt: Date,
  durationMs: number | null = null
) => {
  const db = getDb();
  await db.insert(replyTable).values({
    questionId,
    subjectId,
    userId,
    score: 10,
    repliedAnswer: 'A',
    durationMs,
    repliedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  });
};

const insertPendingReply = async (userId: number, questionId: number, createdAt: Date) => {
  const db = getDb();
  await db.insert(pendingReplyTable).values({ questionId, userId, createdAt, updatedAt: createdAt });
};

describe('housekeep', () => {
  beforeAll(clearTables);
  afterEach(clearTables);
  afterAll(async () => {
    await closeDb();
  });

  it('deletes reply rows older than 1 year but keeps newer ones', async () => {
    const { userId, subjectId, questionId } = await seedFixture();
    const db = getDb();
    await insertReply(userId, subjectId, questionId, new Date(Date.now() - 366 * DAY_MS));
    await insertReply(userId, subjectId, questionId, new Date(Date.now() - 364 * DAY_MS));

    await cleanOldData(db);

    const remaining = await db.select().from(replyTable).where(eq(replyTable.userId, userId));
    expect(remaining).toHaveLength(1);
  });

  it('deletes pending_reply rows older than 7 days but keeps newer ones', async () => {
    const { userId, questionId } = await seedFixture();
    const db = getDb();
    await insertPendingReply(userId, questionId, new Date(Date.now() - 8 * DAY_MS));
    await insertPendingReply(userId, questionId, new Date(Date.now() - 6 * DAY_MS));

    await cleanOldData(db);

    const remaining = await db.select().from(pendingReplyTable).where(eq(pendingReplyTable.userId, userId));
    expect(remaining).toHaveLength(1);
  });

  it('uses a much shorter cutoff for pending_reply than reply', async () => {
    const { userId, subjectId, questionId } = await seedFixture();
    const db = getDb();
    // 30 days old: long gone for pending_reply (7-day cutoff), nowhere
    // near old enough for reply (1-year cutoff).
    const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS);
    await insertReply(userId, subjectId, questionId, thirtyDaysAgo);
    await insertPendingReply(userId, questionId, thirtyDaysAgo);

    await cleanOldData(db);

    const remainingReplies = await db.select().from(replyTable).where(eq(replyTable.userId, userId));
    const remainingPending = await db.select().from(pendingReplyTable).where(eq(pendingReplyTable.userId, userId));
    expect(remainingReplies).toHaveLength(1);
    expect(remainingPending).toHaveLength(0);
  });

  it('does nothing when there is no old data', async () => {
    const { userId, subjectId, questionId } = await seedFixture();
    const db = getDb();
    await insertReply(userId, subjectId, questionId, new Date());
    await insertPendingReply(userId, questionId, new Date());

    await cleanOldData(db);

    const remainingReplies = await db.select().from(replyTable).where(eq(replyTable.userId, userId));
    const remainingPending = await db.select().from(pendingReplyTable).where(eq(pendingReplyTable.userId, userId));
    expect(remainingReplies).toHaveLength(1);
    expect(remainingPending).toHaveLength(1);
  });

  describe('duration stat invalidation on deletion', () => {
    const getQuestionStats = async (questionId: number) => {
      const db = getDb();
      const [row] = await db.select().from(questionTable).where(eq(questionTable.id, questionId));
      return { p5: row.durationP5Ms, median: row.durationMedianMs };
    };

    const getSubjectMedian = async (subjectId: number) => {
      const db = getDb();
      const [row] = await db.select().from(subjectTable).where(eq(subjectTable.id, subjectId));
      return row.durationMedianMs;
    };

    it("resets a question's duration_p5_ms/duration_median_ms to NULL when every duration-tracked reply to it ages out", async () => {
      const { userId, subjectId, questionId } = await seedFixture();
      const db = getDb();
      // Pre-seed as if a prior run had computed real stats.
      await db
        .update(questionTable)
        .set({ durationP5Ms: 111, durationMedianMs: 222 })
        .where(eq(questionTable.id, questionId));
      const wayOld = new Date(Date.now() - 400 * DAY_MS);
      for (let i = 0; i < 15; i++) await insertReply(userId, subjectId, questionId, wayOld, (i + 1) * 100);

      await cleanOldData(db);

      expect(await getQuestionStats(questionId)).toEqual({ p5: null, median: null });
    });

    it("recomputes a question's duration_median_ms from whatever remains, not just resetting it, when only some replies age out", async () => {
      const { userId, subjectId, questionId } = await seedFixture();
      const db = getDb();
      const wayOld = new Date(Date.now() - 400 * DAY_MS);
      const recent = new Date();
      // 5 old (deleted) + 15 recent (kept, still >= MIN_QUESTION_SAMPLES) --
      // median should reflect only the 15 that remain, not the deleted 5.
      for (let i = 0; i < 5; i++) await insertReply(userId, subjectId, questionId, wayOld, 999999);
      for (let i = 0; i < 15; i++) await insertReply(userId, subjectId, questionId, recent, (i + 1) * 100);

      await cleanOldData(db);

      // 15 values 100..1500 step 100 -> idx = 0.5*14 = 7 -> sorted[7] = 800.
      expect((await getQuestionStats(questionId)).median).toBe(800);
    });

    it("resets a subject's duration_median_ms to NULL once enough of its replies age out to drop below MIN_SUBJECT_SAMPLES", async () => {
      const { userId, subjectId, questionId } = await seedFixture();
      const db = getDb();
      await db.update(subjectTable).set({ durationMedianMs: 999 }).where(eq(subjectTable.id, subjectId));
      const wayOld = new Date(Date.now() - 400 * DAY_MS);
      for (let i = 0; i < 10; i++) await insertReply(userId, subjectId, questionId, wayOld, (i + 1) * 10);

      await cleanOldData(db);

      expect(await getSubjectMedian(subjectId)).toBeNull();
    });

    it('does not touch a question with no expiring replies at all', async () => {
      const { userId, subjectId, questionId } = await seedFixture();
      const db = getDb();
      await db
        .update(questionTable)
        .set({ durationP5Ms: 500, durationMedianMs: 500 })
        .where(eq(questionTable.id, questionId));
      await insertReply(userId, subjectId, questionId, new Date(), 500); // recent, nothing to delete

      await cleanOldData(db);

      expect(await getQuestionStats(questionId)).toEqual({ p5: 500, median: 500 });
    });

    it("aggregates a subject's recompute across multiple questions, matching questionStat.ts's own aggregation", async () => {
      const { userId, subjectId, questionId: questionA } = await seedFixture();
      const questionB = await seedQuestion(subjectId);
      const wayOld = new Date(Date.now() - 400 * DAY_MS);
      // 15 + 15 = 30 old replies across two questions in the same
      // subject, all about to expire.
      for (let i = 0; i < 15; i++) await insertReply(userId, subjectId, questionA, wayOld, (i + 1) * 10);
      for (let i = 0; i < 15; i++) await insertReply(userId, subjectId, questionB, wayOld, (i + 16) * 10);

      await cleanOldData(getDb());

      // All 30 just got deleted -> below MIN_SUBJECT_SAMPLES -> NULL.
      expect(await getSubjectMedian(subjectId)).toBeNull();
    });
  });
});
