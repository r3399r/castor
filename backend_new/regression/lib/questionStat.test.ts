import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from 'src/db/client';
import {
  durationGlobalStatTable,
  examSubjectTable,
  examTable,
  questionTable,
  replyTable,
  subjectTable,
  userTable,
} from 'src/db/schema';
import { computeQuestionStats } from 'src/lib/questionStat';

const clearTables = async () => {
  const db = getDb();
  await db.delete(durationGlobalStatTable);
  await db.delete(replyTable);
  await db.update(questionTable).set({ parentId: null });
  await db.delete(questionTable);
  await db.delete(examSubjectTable);
  await db.delete(examTable);
  await db.delete(subjectTable);
  await db.delete(userTable);
};

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

const seedFixture = async () => {
  const db = getDb();
  const [{ insertId: userId }] = await db
    .insert(userTable)
    .values({ firebaseUid: 'fixture-uid', createdAt: new Date(), updatedAt: new Date() });
  const [{ insertId: subjectId }] = await db.insert(subjectTable).values({ name: 'fixture subject', createdAt: new Date() });
  const [{ insertId: examId }] = await db.insert(examTable).values({ name: 'fixture exam', createdAt: new Date() });
  await db.insert(examSubjectTable).values({ examId, subjectId });
  return { userId, subjectId };
};

const insertReply = async (
  userId: number,
  subjectId: number,
  questionId: number,
  durationMs: number | null,
  repliedAt = new Date(),
  tooFast = false
) => {
  const db = getDb();
  const now = new Date();
  await db.insert(replyTable).values({
    questionId,
    subjectId,
    userId,
    score: 10,
    repliedAnswer: 'A',
    durationMs,
    tooFast,
    repliedAt,
    createdAt: now,
    updatedAt: now,
  });
};

const getDurationP5 = async (questionId: number) => {
  const db = getDb();
  const [row] = await db.select().from(questionTable).where(eq(questionTable.id, questionId));
  return row.durationP5Ms;
};

const getQuestionMedian = async (questionId: number) => {
  const db = getDb();
  const [row] = await db.select().from(questionTable).where(eq(questionTable.id, questionId));
  return row.durationMedianMs;
};

const getSubjectMedian = async (subjectId: number) => {
  const db = getDb();
  const [row] = await db.select().from(subjectTable).where(eq(subjectTable.id, subjectId));
  return row.durationMedianMs;
};

const getGlobalMedian = async () => {
  const db = getDb();
  const [row] = await db.select().from(durationGlobalStatTable);
  return row?.medianMs ?? null;
};

// Inserts one reply per duration in `durations`, all against the same
// question/subject -- lets a test seed exactly N samples without N
// individual insertReply calls.
const insertReplies = async (userId: number, subjectId: number, questionId: number, durations: number[]) => {
  for (const durationMs of durations) await insertReply(userId, subjectId, questionId, durationMs);
};

describe('questionStat', () => {
  beforeAll(clearTables);
  afterEach(clearTables);
  afterAll(async () => {
    await closeDb();
  });

  it('sets duration_p5_ms to the single value when a question has only one reply', async () => {
    const { userId, subjectId } = await seedFixture();
    const questionId = await seedQuestion(subjectId);
    await insertReply(userId, subjectId, questionId, 500);

    await computeQuestionStats(getDb());

    expect(await getDurationP5(questionId)).toBe(500);
  });

  it('linearly interpolates the 5th percentile across multiple replies', async () => {
    const { userId, subjectId } = await seedFixture();
    const questionId = await seedQuestion(subjectId);
    // idx = 0.05 * (2-1) = 0.05 -> 100*(1-0.05) + 200*0.05 = 105
    await insertReply(userId, subjectId, questionId, 200);
    await insertReply(userId, subjectId, questionId, 100);

    await computeQuestionStats(getDb());

    expect(await getDurationP5(questionId)).toBe(105);
  });

  it('ignores replies with no recorded duration', async () => {
    const { userId, subjectId } = await seedFixture();
    const questionId = await seedQuestion(subjectId);
    await insertReply(userId, subjectId, questionId, null);
    await insertReply(userId, subjectId, questionId, null);
    await insertReply(userId, subjectId, questionId, 300);

    await computeQuestionStats(getDb());

    expect(await getDurationP5(questionId)).toBe(300);
  });

  it('leaves duration_p5_ms untouched for a question with no duration data at all', async () => {
    const { subjectId } = await seedFixture();
    const questionId = await seedQuestion(subjectId);

    await computeQuestionStats(getDb());

    expect(await getDurationP5(questionId)).toBeNull();
  });

  it('computes independently per question', async () => {
    const { userId, subjectId } = await seedFixture();
    const questionA = await seedQuestion(subjectId);
    const questionB = await seedQuestion(subjectId);
    await insertReply(userId, subjectId, questionA, 500);
    await insertReply(userId, subjectId, questionB, 900);

    await computeQuestionStats(getDb());

    expect(await getDurationP5(questionA)).toBe(500);
    expect(await getDurationP5(questionB)).toBe(900);
  });

  it('skips a question whose only replies are outside the lookback window', async () => {
    const { userId, subjectId } = await seedFixture();
    const questionId = await seedQuestion(subjectId);
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await insertReply(userId, subjectId, questionId, 500, fiveDaysAgo);

    await computeQuestionStats(getDb());

    // Not recomputed -- no reply in the last LOOKBACK_DAYS, so this
    // question was never selected for reprocessing.
    expect(await getDurationP5(questionId)).toBeNull();
  });

  it('recomputes using the full reply history, not just the recent window, once a question is selected', async () => {
    const { userId, subjectId } = await seedFixture();
    const questionId = await seedQuestion(subjectId);
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    // Old reply (outside the lookback window) plus one recent reply --
    // the recent one makes this question selected for reprocessing, but
    // the percentile itself should still be computed over both.
    await insertReply(userId, subjectId, questionId, 100, fiveDaysAgo);
    await insertReply(userId, subjectId, questionId, 200);

    await computeQuestionStats(getDb());

    // Same 105 as the "linearly interpolates" test above -- confirms the
    // old reply's duration was included, not just the recent one's.
    expect(await getDurationP5(questionId)).toBe(105);
  });

  describe('question-level duration_median_ms', () => {
    it('leaves duration_median_ms NULL with fewer than MIN_QUESTION_SAMPLES replies, even though duration_p5_ms still gets set', async () => {
      const { userId, subjectId } = await seedFixture();
      const questionId = await seedQuestion(subjectId);
      await insertReplies(userId, subjectId, questionId, [100, 200, 300, 400, 500]); // 5, below the 10 floor

      await computeQuestionStats(getDb());

      expect(await getQuestionMedian(questionId)).toBeNull();
      expect(await getDurationP5(questionId)).not.toBeNull();
    });

    it('sets duration_median_ms once there are at least MIN_QUESTION_SAMPLES replies', async () => {
      const { userId, subjectId } = await seedFixture();
      const questionId = await seedQuestion(subjectId);
      // 10 samples, exactly at the floor. Sorted: 100..1000 step 100.
      // idx = 0.5*(10-1) = 4.5 -> sorted[4]=500, sorted[5]=600 -> 550.
      await insertReplies(
        userId,
        subjectId,
        questionId,
        [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100]
      );

      await computeQuestionStats(getDb());

      expect(await getQuestionMedian(questionId)).toBe(550);
    });
  });

  describe('subject-level duration_median_ms', () => {
    it('leaves subject.duration_median_ms NULL with fewer than MIN_SUBJECT_SAMPLES replies', async () => {
      const { userId, subjectId } = await seedFixture();
      const questionId = await seedQuestion(subjectId);
      const durations = Array.from({ length: 29 }, (_, i) => (i + 1) * 10); // 29, below the 30 floor
      await insertReplies(userId, subjectId, questionId, durations);

      await computeQuestionStats(getDb());

      expect(await getSubjectMedian(subjectId)).toBeNull();
    });

    it('sets subject.duration_median_ms once the subject has at least MIN_SUBJECT_SAMPLES replies, aggregated across its questions', async () => {
      const { userId, subjectId } = await seedFixture();
      const questionA = await seedQuestion(subjectId);
      const questionB = await seedQuestion(subjectId);
      // 15 + 15 = 30 across two questions in the same subject, at the
      // floor. Combined sorted set is 10..300 step 10 (30 values) ->
      // idx = 0.5*29 = 14.5 -> sorted[14]=150, sorted[15]=160 -> 155.
      const first15 = Array.from({ length: 15 }, (_, i) => (i + 1) * 10);
      const second15 = Array.from({ length: 15 }, (_, i) => (i + 16) * 10);
      await insertReplies(userId, subjectId, questionA, first15);
      await insertReplies(userId, subjectId, questionB, second15);

      await computeQuestionStats(getDb());

      expect(await getSubjectMedian(subjectId)).toBe(155);
    });

    it('resets a previously-qualifying subject back to NULL once its sample count drops below the floor', async () => {
      const { userId, subjectId } = await seedFixture();
      const questionId = await seedQuestion(subjectId);
      const db = getDb();
      await db.update(subjectTable).set({ durationMedianMs: 999 }).where(eq(subjectTable.id, subjectId));
      await insertReplies(userId, subjectId, questionId, [100, 200, 300]); // well below 30

      await computeQuestionStats(getDb());

      expect(await getSubjectMedian(subjectId)).toBeNull();
    });

    it('does not reprocess a subject whose only replies are outside the lookback window', async () => {
      const { userId, subjectId } = await seedFixture();
      const questionId = await seedQuestion(subjectId);
      const db = getDb();
      await db.update(subjectTable).set({ durationMedianMs: 999 }).where(eq(subjectTable.id, subjectId));
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      // 30 old replies -- would qualify by sample count alone, but none
      // are within LOOKBACK_DAYS, so this subject is never selected for
      // reprocessing (same lookback tradeoff question-level has always
      // had; housekeep.test.ts covers the complementary deletion path
      // that keeps this correct when data actually ages out).
      for (let i = 0; i < 30; i++) await insertReply(userId, subjectId, questionId, (i + 1) * 10, fiveDaysAgo);

      await computeQuestionStats(getDb());

      // Stays at the old, pre-seeded value -- not reprocessed, not reset.
      expect(await getSubjectMedian(subjectId)).toBe(999);
    });
  });

  describe('duration_global_stat', () => {
    it('has no row when there is no duration data anywhere', async () => {
      await seedFixture();

      await computeQuestionStats(getDb());

      expect(await getGlobalMedian()).toBeNull();
    });

    it('computes the median across every subject combined, not per-subject', async () => {
      const { userId, subjectId: subjectA } = await seedFixture();
      const db = getDb();
      const [{ insertId: subjectB }] = await db
        .insert(subjectTable)
        .values({ name: 'fixture subject b', createdAt: new Date() });
      const questionA = await seedQuestion(subjectA);
      const questionB = await seedQuestion(subjectB);
      // Combined: 100, 200, 300, 400 -> idx = 0.5*3 = 1.5 -> 200*0.5+300*0.5 = 250.
      await insertReplies(userId, subjectA, questionA, [100, 200]);
      await insertReplies(userId, subjectB, questionB, [300, 400]);

      await computeQuestionStats(getDb());

      expect(await getGlobalMedian()).toBe(250);
    });

    it('updates the existing row on a later run rather than inserting a second one', async () => {
      const { userId, subjectId } = await seedFixture();
      const questionId = await seedQuestion(subjectId);
      await insertReplies(userId, subjectId, questionId, [100, 200]);
      await computeQuestionStats(getDb());
      const firstMedian = await getGlobalMedian();

      await insertReplies(userId, subjectId, questionId, [900, 1000]);
      await computeQuestionStats(getDb());

      const db = getDb();
      const rows = await db.select().from(durationGlobalStatTable);
      expect(rows).toHaveLength(1);
      expect(rows[0].medianMs).not.toBe(firstMedian);
    });
  });

  describe('tooFast exclusion', () => {
    it('excludes tooFast=true replies from duration_p5_ms/duration_median_ms at the question level', async () => {
      const { userId, subjectId } = await seedFixture();
      const questionId = await seedQuestion(subjectId);
      // 10 legitimate replies (100..1000) plus a flood of farming attempts
      // at 1ms each -- if those polluted the stats, p5/median would be
      // dragged down toward 1.
      await insertReplies(userId, subjectId, questionId, [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100]);
      for (let i = 0; i < 20; i++) await insertReply(userId, subjectId, questionId, 1, new Date(), true);

      await computeQuestionStats(getDb());

      // Same 550/145 as the "sets duration_median_ms"/"linearly
      // interpolates" tests above -- confirms the 20 tooFast replies were
      // excluded entirely, not just discounted.
      expect(await getQuestionMedian(questionId)).toBe(550);
      expect(await getDurationP5(questionId)).toBe(145);
    });

    it('excludes tooFast=true replies from subject.duration_median_ms', async () => {
      const { userId, subjectId } = await seedFixture();
      const questionA = await seedQuestion(subjectId);
      const questionB = await seedQuestion(subjectId);
      const first15 = Array.from({ length: 15 }, (_, i) => (i + 1) * 10);
      const second15 = Array.from({ length: 15 }, (_, i) => (i + 16) * 10);
      await insertReplies(userId, subjectId, questionA, first15);
      await insertReplies(userId, subjectId, questionB, second15);
      for (let i = 0; i < 20; i++) await insertReply(userId, subjectId, questionA, 1, new Date(), true);

      await computeQuestionStats(getDb());

      // Same 155 as the "aggregated across its questions" test above --
      // the tooFast flood didn't shift the subject median at all.
      expect(await getSubjectMedian(subjectId)).toBe(155);
    });

    it('excludes tooFast=true replies from duration_global_stat', async () => {
      const { userId, subjectId: subjectA } = await seedFixture();
      const db = getDb();
      const [{ insertId: subjectB }] = await db
        .insert(subjectTable)
        .values({ name: 'fixture subject b', createdAt: new Date() });
      const questionA = await seedQuestion(subjectA);
      const questionB = await seedQuestion(subjectB);
      await insertReplies(userId, subjectA, questionA, [100, 200]);
      await insertReplies(userId, subjectB, questionB, [300, 400]);
      for (let i = 0; i < 20; i++) await insertReply(userId, subjectA, questionA, 1, new Date(), true);

      await computeQuestionStats(getDb());

      // Same 250 as the "computes the median across every subject
      // combined" test above -- the tooFast flood didn't shift it.
      expect(await getGlobalMedian()).toBe(250);
    });
  });
});
