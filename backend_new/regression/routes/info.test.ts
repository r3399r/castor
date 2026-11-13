import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
import {
  categoryTable,
  examTable,
  questionExamTable,
  questionTable,
  subjectTable,
  userTable,
} from 'src/db/schema';
import type { GetInfoPopularResponse, GetInfoStatsResponse } from '@castor/shared';
import {
  getInfoGrowthResponseSchema,
  getInfoPopularResponseSchema,
  getInfoResponseSchema,
  getInfoStatsResponseSchema,
} from 'src/routes/info';
import { SUBSCRIBER_XP_BONUS_PERCENT, investmentXp } from 'src/lib/guardianLevel';

const clearTables = async () => {
  const db = getDb();
  await db.delete(questionExamTable);
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

const getPopular = async () => {
  const res = await app.request('/api/info/popular');
  expect(res.status).toBe(200);

  return (await res.json()) as GetInfoPopularResponse;
};

const addSubject = async (name: string, sortOrder = 0) => {
  const [{ insertId }] = await getDb().insert(subjectTable).values({ name, sortOrder });

  return insertId;
};

const addExam = async (name: string) => {
  const [{ insertId }] = await getDb().insert(examTable).values({ name });

  return insertId;
};

/** One question row; attempCount is what /popular ranks on. */
const addQuestion = async (
  subjectId: number,
  over: Partial<typeof questionTable.$inferInsert> = {}
) => {
  const [{ insertId }] = await getDb()
    .insert(questionTable)
    .values({
      uuid: crypto.randomUUID(),
      subjectId,
      type: 'SINGLE',
      difficulty: 5,
      adjustedDifficulty: 5,
      enabled: true,
      ...over,
    });

  return insertId;
};

const fileUnderExam = async (questionId: number, examId: number) => {
  await getDb().insert(questionExamTable).values({ questionId, examId });
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

  it('reports no popular subjects for an empty catalog', async () => {
    expect(await getPopular()).toEqual([]);
  });

  it('counts a 題組 once, not once per sub-question', async () => {
    const quiet = await addSubject('quiet');
    const busy = await addSubject('busy');

    // One standalone question, practised five times.
    await addQuestion(quiet, { attempCount: 5 });

    // A 題組 practised nine times. reply.ts only ever increments the child
    // that was answered, so the parent's own counter stays at 0 -- without
    // the rollup this subject scores 0 and ranks last.
    //
    // The sub-questions are given different counters, which is what a
    // sub-question added to an existing group looks like, so this pins the
    // reduction down to MAX: SUM would say 16 and AVG would say 8.
    const groupId = await addQuestion(busy, { type: 'GROUP', isGroup: true });
    await addQuestion(busy, { parentId: groupId, sortOrder: 1, attempCount: 9 });
    await addQuestion(busy, { parentId: groupId, sortOrder: 2, attempCount: 7 });

    const popular = await getPopular();
    expect(popular.map((s) => [s.name, s.attemptCount])).toEqual([
      ['busy', 9],
      ['quiet', 5],
    ]);
    // The 題組 is one question however many sub-questions it holds.
    expect(popular[0].questionCount).toBe(1);
  });

  it('ignores questions still awaiting review, and their attempts', async () => {
    const shown = await addSubject('shown');
    const hidden = await addSubject('hidden');
    await addQuestion(shown, { attempCount: 1 });
    await addQuestion(hidden, { enabled: false, attempCount: 100 });

    expect((await getPopular()).map((s) => s.name)).toEqual(['shown']);
  });

  it('ranks a subject exams by attempts, reading the link off the parent', async () => {
    const subjectId = await addSubject('sub');
    const busyExam = await addExam('busy exam');
    const quietExam = await addExam('quiet exam');

    // question_exam is only populated on the parent of a 題組, so the
    // children's attempts reach the exam only through the rollup.
    const groupId = await addQuestion(subjectId, { type: 'GROUP', isGroup: true });
    await addQuestion(subjectId, { parentId: groupId, sortOrder: 1, attempCount: 7 });
    await fileUnderExam(groupId, busyExam);

    const plainId = await addQuestion(subjectId, { attempCount: 3 });
    await fileUnderExam(plainId, quietExam);

    const [subject] = await getPopular();
    expect(subject.exams.map((e) => [e.name, e.attemptCount])).toEqual([
      ['busy exam', 7],
      ['quiet exam', 3],
    ]);
  });

  it('returns a subject filed under no exam with an empty exam list', async () => {
    const subjectId = await addSubject('sub');
    await addQuestion(subjectId, { attempCount: 2 });

    expect(await getPopular()).toEqual([
      { id: subjectId, name: 'sub', attemptCount: 2, questionCount: 1, exams: [] },
    ]);
  });

  it('caps the response at three subjects and five exams each', async () => {
    const subjectIds = await Promise.all(
      [1, 2, 3, 4].map((n) => addSubject(`sub ${n}`, n))
    );
    for (const subjectId of subjectIds) await addQuestion(subjectId);

    const first = subjectIds[0];
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const questionId = await addQuestion(first, { attempCount: n });
      await fileUnderExam(questionId, await addExam(`exam ${n}`));
    }

    const popular = await getPopular();
    expect(popular).toHaveLength(3);
    expect(popular[0].exams).toHaveLength(5);
    // Trimmed from the bottom: the single-attempt exam is the one dropped.
    expect(popular[0].exams.map((e) => e.attemptCount)).toEqual([6, 5, 4, 3, 2]);
  });

  it('orders subjects stably when nothing has been attempted yet', async () => {
    // Every attemptCount is 0, so attempts alone would let MySQL pick any
    // three; sort_order is what keeps the section from reshuffling.
    const ids = await Promise.all([3, 1, 2].map((n) => addSubject(`sub ${n}`, n)));
    for (const subjectId of ids) await addQuestion(subjectId);

    expect((await getPopular()).map((s) => s.name)).toEqual(['sub 1', 'sub 2', 'sub 3']);
  });

  /**
   * What the OpenAPI document promises, against what is sent.
   *
   * The key check is separate from the parse because zod strips unknown
   * keys instead of rejecting them: a count added to a query and spread
   * into one of these responses would pass the parse while appearing in
   * no document.
   */
  it('sends exactly what the OpenAPI document describes', async () => {
    const subjectId = await addSubject('sub');
    const questionId = await addQuestion(subjectId, { attempCount: 4 });
    await fileUnderExam(questionId, await addExam('exam'));
    await getDb().insert(userTable).values({ firebaseUid: 'uid-1' });

    const stats: unknown = await (await app.request('/api/info/stats')).json();
    const statsParsed = getInfoStatsResponseSchema.safeParse(stats);
    expect(statsParsed.error?.issues ?? []).toEqual([]);
    expect(Object.keys(stats as object).sort()).toEqual([
      'categoryCount',
      'examCount',
      'questionCount',
      'subjectCount',
      'userCount',
    ]);

    const popular: unknown = await (await app.request('/api/info/popular')).json();
    const popularParsed = getInfoPopularResponseSchema.safeParse(popular);
    expect(popularParsed.error?.issues ?? []).toEqual([]);
    const [subject] = popular as { exams: object[] }[];
    expect(Object.keys(subject).sort()).toEqual([
      'attemptCount',
      'exams',
      'id',
      'name',
      'questionCount',
    ]);
    expect(Object.keys(subject.exams[0]).sort()).toEqual([
      'attemptCount',
      'id',
      'name',
      'questionCount',
    ]);
  });

  it('publishes the growth rate the invest handler actually grants', async () => {
    const res = await app.request('/api/info/growth');
    expect(res.status).toBe(200);
    const body: unknown = await res.json();

    const parsed = getInfoGrowthResponseSchema.safeParse(body);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(Object.keys(body as object).sort()).toEqual(['subscriberXpBonusPercent']);

    // Not a restatement of the constant. The published number is checked
    // against the arithmetic POST /api/guardian/{id}/invest runs, so
    // changing either one alone fails here -- and those two disagreeing is
    // the whole reason this endpoint exists, because the client states the
    // XP before the investment and the server grants it afterwards.
    const { subscriberXpBonusPercent: percent } = body as { subscriberXpBonusPercent: number };
    expect(percent).toBe(SUBSCRIBER_XP_BONUS_PERCENT);
    expect(investmentXp(1_000, true)).toBe(1_000 + (1_000 * percent) / 100);
    expect(investmentXp(1_000, false)).toBe(1_000);
  });

  it('leaves the health check free of the database', async () => {
    const res = await app.request('/api/info');
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect((body as { status: string }).status).toBe('ok');

    const parsed = getInfoResponseSchema.safeParse(body);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(Object.keys(body as object).sort()).toEqual(['status', 'time']);
  });
});
