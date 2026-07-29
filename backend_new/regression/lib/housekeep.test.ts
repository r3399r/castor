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

const insertReply = async (userId: number, subjectId: number, questionId: number, createdAt: Date) => {
  const db = getDb();
  await db.insert(replyTable).values({
    questionId,
    subjectId,
    userId,
    score: 10,
    repliedAnswer: 'A',
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
});
