import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
import {
  categoryTable,
  examTable,
  questionTable,
  subjectTable,
  userTable,
} from 'src/db/schema';
import type { GetInfoStatsResponse } from '@castor/shared';

const clearTables = async () => {
  const db = getDb();
  // parentId self-references question, so the link has to be dropped
  // before the rows can go.
  await db.update(questionTable).set({ parentId: null });
  await db.delete(questionTable);
  await db.delete(examTable);
  await db.delete(subjectTable);
  await db.delete(categoryTable);
  await db.delete(userTable);
};

const getStats = async () => {
  const res = await app.request('/api/info/stats');
  expect(res.status).toBe(200);

  return (await res.json()) as GetInfoStatsResponse;
};

describe('info routes', () => {
  afterEach(clearTables);

  afterAll(async () => {
    await closeDb();
  });

  it('counts an empty catalog as zeros', async () => {
    expect(await getStats()).toEqual({
      categoryCount: 0,
      subjectCount: 0,
      examCount: 0,
      questionCount: 0,
      userCount: 0,
    });
  });

  it('counts categories, subjects, exams and users', async () => {
    const db = getDb();
    await db.insert(categoryTable).values([{ name: 'cat a' }, { name: 'cat b' }]);
    await db.insert(subjectTable).values([{ name: 'sub a' }]);
    await db
      .insert(examTable)
      .values([{ name: 'exam a' }, { name: 'exam b' }, { name: 'exam c' }]);
    await db
      .insert(userTable)
      .values([{ firebaseUid: 'uid-1' }, { firebaseUid: 'uid-2' }]);

    const stats = await getStats();
    expect(stats.categoryCount).toBe(2);
    expect(stats.subjectCount).toBe(1);
    expect(stats.examCount).toBe(3);
    expect(stats.userCount).toBe(2);
  });

  it('counts only enabled top-level questions', async () => {
    const db = getDb();
    const [{ insertId: subjectId }] = await db
      .insert(subjectTable)
      .values({ name: 'sub a' });
    const question = (over: Partial<typeof questionTable.$inferInsert>) => ({
      uuid: crypto.randomUUID(),
      subjectId,
      type: 'SINGLE',
      difficulty: 5,
      adjustedDifficulty: 5,
      enabled: true,
      ...over,
    });

    const [{ insertId: groupId }] = await db
      .insert(questionTable)
      .values(question({ type: 'GROUP', isGroup: true }));
    await db.insert(questionTable).values([
      question({}),
      // Awaiting admin review -- /adaptive won't serve it, so the landing
      // page mustn't advertise it either.
      question({ enabled: false }),
      // A 題組's children: the parent above is the one question a user is
      // given, so these must not be counted on top of it.
      question({ parentId: groupId, sortOrder: 1 }),
      question({ parentId: groupId, sortOrder: 2 }),
    ]);

    // The GROUP parent and the one plain enabled question.
    expect((await getStats()).questionCount).toBe(2);
  });

  it('leaves the health check free of the database', async () => {
    const res = await app.request('/api/info');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });
});
