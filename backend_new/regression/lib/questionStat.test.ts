import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from 'src/db/client';
import {
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
  repliedAt = new Date()
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
});
