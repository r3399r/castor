import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
import {
  categoryTable,
  conceptGroupTable,
  conceptTable,
  durationGlobalStatTable,
  examSubjectTable,
  examTable,
  pendingReplyTable,
  pointTransactionTable,
  questionConceptTable,
  questionExamTable,
  questionTable,
  questionTagTable,
  replyTable,
  subjectCategoryTable,
  subjectTable,
  tagTable,
  userConceptStatTable,
  userStatHistoryTable,
  userTable,
  userWrongQuestionTable,
} from 'src/db/schema';
import { ADMIN_EMAILS } from 'src/middleware/adminAuth';
import { getReplyResponseSchema, postReplyResponseSchema } from 'src/routes/reply';

// Two separate identities are exercised here: verifyIdToken backs the
// admin-only POST /api/question used to seed fixture questions, and
// verifyIdTokenUid backs /api/reply's own requireUser gate.
vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdToken: vi.fn(), verifyIdTokenUid: vi.fn() }));
import { verifyIdToken, verifyIdTokenUid } from 'src/lib/firebaseAdmin';

// The fixture questions created here go through the same POST /question
// that fires off enableFacebookEventBridge -- mocked for the same reason
// as in question.test.ts.
vi.mock('src/lib/facebookEventBridge', () => ({ enableFacebookEventBridge: vi.fn() }));

type QuestionDto = {
  id: number;
  uuid: string;
  subjectId: number;
  parentId: number | null;
  isGroup: boolean;
  type: string;
  sortOrder: number | null;
  content: string | null;
  options: string | null;
  answer: string | null;
  difficulty: number;
  attempCount: number;
  scoringTotal: number;
  adjustedDifficulty: number;
};

type PostReplyResponse = {
  questionId: number;
  repliedAnswer: string;
  correctAnswer: string;
  score: number;
  awardedPoints: number;
  fbPostId: string | null;
}[];

type QuestionDetailDto = {
  id: number;
  content: string | null;
  fbPostId: string | null;
  exam: { id: number; name: string }[];
  tag: { id: number; name: string }[];
  concept: { id: number; name: string; conceptGroup: { id: number; name: string } }[];
};

type ReplyGroupDto = {
  repliedAt: string;
  parentQuestion: QuestionDetailDto | null;
  subject: { id: number; name: string };
  subjectId: number;
  children: {
    id: number;
    questionId: number;
    question: QuestionDetailDto;
    parentId: number | null;
    score: number;
    repliedAnswer: string | null;
    createdAt: string | null;
  }[];
};

const postQuestions = (body: unknown) =>
  app.request('/api/question', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const postReply = (body: unknown) =>
  app.request('/api/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const getReplyList = (query = '') => app.request(`/api/reply${query}`);

const createQuestion = async (
  subjectId: number,
  examId: number,
  overrides: Partial<{
    type: string;
    content: string;
    options: string;
    answer: string;
    difficulty: number;
    conceptIds: number[];
    tagIds: number[];
  }> & { conceptIds: number[] }
) => {
  const res = await postQuestions({
    subjectId,
    examId,
    questions: [
      {
        type: 'SINGLE',
        content: 'question content',
        options: 'A|B',
        answer: 'A',
        difficulty: 5,
        ...overrides,
      },
    ],
  });
  const body = (await res.json()) as QuestionDto[][];
  const question = body[0][0];
  // Questions are created disabled (admin review gate) and this suite is
  // about what happens once a user can actually be served one.
  await app.request(`/api/question/${question.id}/enabled`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true }),
  });
  return question;
};

const createGroupQuestion = async (
  subjectId: number,
  examId: number,
  conceptIds: number[],
  children: { answer: string; options: string }[]
) => {
  const res = await postQuestions({
    subjectId,
    examId,
    questions: [
      {
        type: 'GROUP',
        difficulty: 5,
        conceptIds,
        childQuestions: children.map((c, i) => ({
          type: 'SINGLE',
          sortOrder: i,
          content: `child ${i}`,
          options: c.options,
          answer: c.answer,
          difficulty: 5,
        })),
      },
    ],
  });
  const body = (await res.json()) as QuestionDto[][];
  return body[0];
};

const clearTables = async () => {
  const db = getDb();
  await db.delete(durationGlobalStatTable);
  await db.delete(pendingReplyTable);
  await db.delete(userWrongQuestionTable);
  await db.delete(pointTransactionTable);
  await db.delete(replyTable);
  await db.delete(userConceptStatTable);
  await db.delete(userStatHistoryTable);
  await db.delete(questionTagTable);
  await db.delete(questionConceptTable);
  await db.delete(questionExamTable);
  await db.update(questionTable).set({ parentId: null });
  await db.delete(questionTable);
  await db.delete(conceptTable);
  await db.delete(conceptGroupTable);
  await db.delete(tagTable);
  await db.delete(examSubjectTable);
  await db.delete(examTable);
  await db.delete(subjectCategoryTable);
  await db.delete(subjectTable);
  await db.delete(categoryTable);
  await db.delete(userTable);
};

const seedFixture = async () => {
  const db = getDb();
  const [{ insertId: subjectId }] = await db
    .insert(subjectTable)
    .values({ name: 'fixture subject', createdAt: new Date() });
  const [{ insertId: examId }] = await db
    .insert(examTable)
    .values({ name: 'fixture exam', createdAt: new Date() });
  await db.insert(examSubjectTable).values({ examId, subjectId });
  const [{ insertId: tagId }] = await db
    .insert(tagTable)
    .values({ name: 'fixture tag', subjectId, createdAt: new Date() });
  const [{ insertId: groupId }] = await db
    .insert(conceptGroupTable)
    .values({ name: 'fixture group', subjectId, createdAt: new Date() });
  const [{ insertId: conceptId }] = await db
    .insert(conceptTable)
    .values({ name: 'fixture concept', conceptGroupId: groupId, createdAt: new Date() });
  return { subjectId, examId, tagId, conceptId };
};

const seedUser = async () => {
  const db = getDb();
  const [{ insertId: userId }] = await db.insert(userTable).values({
    firebaseUid: 'fixture-uid',
    email: 'fixture-user@example.com',
    name: 'fixture user',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return userId;
};

describe('reply routes', () => {
  beforeAll(clearTables);

  beforeEach(() => {
    vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);
  });

  afterEach(clearTables);

  afterAll(async () => {
    await closeDb();
  });

  describe('POST /', () => {
    it('rejects with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdTokenUid).mockResolvedValue(null);
      const res = await postReply([{ questionId: 1, repliedAnswer: 'A' }]);
      expect(res.status).toBe(401);
    });

    it('rejects with 401 when the token resolves to an unknown user', async () => {
      vi.mocked(verifyIdTokenUid).mockResolvedValue('unknown-uid');
      const res = await postReply([{ questionId: 1, repliedAnswer: 'A' }]);
      expect(res.status).toBe(401);
    });

    it('scores a correct SINGLE answer as 10 and a wrong one as 0', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const correctQ = await createQuestion(subjectId, examId, { answer: 'A', conceptIds: [conceptId] });
      const wrongQ = await createQuestion(subjectId, examId, { answer: 'A', conceptIds: [conceptId] });

      const res = await postReply([
        { questionId: correctQ.id, repliedAnswer: 'A' },
        { questionId: wrongQ.id, repliedAnswer: 'B' },
      ]);
      expect(res.status).toBe(200);
      const body = (await res.json()) as PostReplyResponse;
      expect(body.find((r) => r.questionId === correctQ.id)).toMatchObject({ score: 10, correctAnswer: 'A' });
      expect(body.find((r) => r.questionId === wrongQ.id)).toMatchObject({ score: 0, correctAnswer: 'A' });
    });

    it('scores MULTIPLE with partial credit', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      // correct = OXOX (4 options), one mismatch -> (4 - 2*1)/4 * 10 = 5
      const q = await createQuestion(subjectId, examId, {
        type: 'MULTIPLE',
        options: 'A|B|C|D',
        answer: 'OXOX',
        conceptIds: [conceptId],
      });

      const res = await postReply([{ questionId: q.id, repliedAnswer: 'OXOO' }]);
      const body = (await res.json()) as PostReplyResponse;
      expect(body[0].score).toBe(5);
    });

    it('scores FILL as all-or-nothing', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const q = await createQuestion(subjectId, examId, {
        type: 'FILL',
        options: 'A|B',
        answer: 'AB',
        conceptIds: [conceptId],
      });

      const partial = await postReply([{ questionId: q.id, repliedAnswer: 'AX' }]);
      expect(((await partial.json()) as PostReplyResponse)[0].score).toBe(0);

      const full = await postReply([{ questionId: q.id, repliedAnswer: 'AB' }]);
      expect(((await full.json()) as PostReplyResponse)[0].score).toBe(10);
    });

    describe('CLOZE', () => {
      // POST /question rejects a CLOZE whose data-blank count doesn't
      // match answer.length, so fixture passages carry real markers.
      const clozePassage = (blanks: number) =>
        Array.from(
          { length: blanks },
          (_, i) => `<u data-blank="${31 + i}">&nbsp;&nbsp;${31 + i}&nbsp;&nbsp;</u>`
        ).join(' ');

      const createCloze = (subjectId: number, examId: number, conceptId: number, answer: string) =>
        createQuestion(subjectId, examId, {
          type: 'CLOZE',
          content: clozePassage(answer.length),
          options: 'A|B|C|D|E',
          answer,
          difficulty: 5,
          conceptIds: [conceptId],
        });

      it('scores CLOZE proportionally, with no penalty for a wrong blank', async () => {
        await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        const q = await createCloze(subjectId, examId, conceptId, 'ABCDEABCDE');

        // 7 of 10 blanks right -> 7/10 * 10 = 7. Note what this is NOT:
        // calcMultipleScore's 2x penalty would make the same answer
        // (10 - 2*3)/10 * 10 = 4. CLOZE deliberately doesn't penalise,
        // because each blank is a single-choice row with no "tick
        // everything" strategy to deter.
        const res = await postReply([{ questionId: q.id, repliedAnswer: 'ABCDEABXXX' }]);
        expect(((await res.json()) as PostReplyResponse)[0].score).toBe(7);
      });

      it('scores an all-correct CLOZE as 10 and an all-wrong one as 0', async () => {
        await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        const q = await createCloze(subjectId, examId, conceptId, 'ABCDE');

        const full = await postReply([{ questionId: q.id, repliedAnswer: 'ABCDE' }]);
        expect(((await full.json()) as PostReplyResponse)[0].score).toBe(10);

        const none = await postReply([{ questionId: q.id, repliedAnswer: 'BCDEA' }]);
        expect(((await none.json()) as PostReplyResponse)[0].score).toBe(0);
      });

      // The load-bearing one. A CLOZE is a single question row where the
      // GROUP form used to be N children, so without the per-blank reward
      // unit a ten-blank passage would pay out the same ~100 points as
      // one multiple-choice question -- roughly a tenth of what the same
      // work earned before. Raising `difficulty` cannot recover that:
      // calcBasePoints tops out at 2x POINTS_BASE.
      it('awards one correct CLOZE the same points as its blank count in separate questions', async () => {
        await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        const q = await createCloze(subjectId, examId, conceptId, 'ABCDEABCDE');

        // Cold start (mastery == difficulty) -> basePoints = 100, which is
        // exactly what one correct SINGLE earns above. 10 blanks -> 1000.
        const res = await postReply([{ questionId: q.id, repliedAnswer: 'ABCDEABCDE' }]);
        expect(((await res.json()) as PostReplyResponse)[0].awardedPoints).toBe(1000);
      });

      it('scales a partially-correct CLOZE by score as well as by blank count', async () => {
        await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        const q = await createCloze(subjectId, examId, conceptId, 'ABCDEABCDE');

        // score 7 -> basePoints 100 * 0.7 = 70, times 10 blanks = 700.
        const res = await postReply([{ questionId: q.id, repliedAnswer: 'ABCDEABXXX' }]);
        expect(((await res.json()) as PostReplyResponse)[0].awardedPoints).toBe(700);
      });

      // The other half of the reward fix. question.durationMedianMs is a
      // whole-passage figure while subject.durationMedianMs is per single
      // question, so the raw ratio for a ten-blank passage lands near 10
      // and gets flattened by WITHIN_SUBJECT_CLAMP's 2.0 ceiling.
      // Dividing by the blank count puts both sides in per-blank units.
      it('compares a CLOZE per blank against the subject median, not per passage', async () => {
        await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        const q = await createCloze(subjectId, examId, conceptId, 'ABCDEABCDE');
        const db = getDb();
        await db.insert(durationGlobalStatTable).values({ medianMs: 20000 });
        await db.update(subjectTable).set({ durationMedianMs: 60000 }).where(eq(subjectTable.id, subjectId));
        // Ten blanks at a typical 60s each = 600s for the whole passage.
        await db.update(questionTable).set({ durationMedianMs: 600000 }).where(eq(questionTable.id, q.id));

        // withinSubjectRatio = (600000/10) / 60000 = 1.0 (the passage is
        // exactly typical per blank). subjectMultiplier = 60000/20000 = 3.
        // 100 * 1.0 * 3 * 10 blanks = 3000.
        //
        // Comparing per passage instead would give clamp(10, 0.5, 2) = 2.0
        // and so 6000 -- a question that happens to be long would be paid
        // double on top of already being paid per blank.
        const res = await postReply([{ questionId: q.id, repliedAnswer: 'ABCDEABCDE' }]);
        expect(((await res.json()) as PostReplyResponse)[0].awardedPoints).toBe(3000);
      });

      it('still pays the full blank-count award before duration_median_ms exists', async () => {
        await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        const q = await createCloze(subjectId, examId, conceptId, 'ABCDEABCDE');
        // question.durationMedianMs left NULL, as it is for the first
        // MIN_QUESTION_SAMPLES replies -- the within-subject layer falls
        // back to a neutral 1.0, so the earliest answerers are not paid a
        // tenth of what later ones get.

        const res = await postReply([{ questionId: q.id, repliedAnswer: 'ABCDEABCDE' }]);
        expect(((await res.json()) as PostReplyResponse)[0].awardedPoints).toBe(1000);
      });

      it('writes one reply row per CLOZE, not one per blank', async () => {
        await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        const q = await createCloze(subjectId, examId, conceptId, 'ABCDEABCDE');

        await postReply([{ questionId: q.id, repliedAnswer: 'ABCDEABXXX' }]);

        const db = getDb();
        const replies = await db.select().from(replyTable).where(eq(replyTable.questionId, q.id));
        expect(replies).toHaveLength(1);
        expect(replies[0]).toMatchObject({ parentId: null, score: 7, awardedPoints: 700 });
      });

      // Other types must be untouched by countRewardUnits: a 10-character
      // FILL answer is one answer split across ten digit slots, not ten
      // independent questions, so it stays worth one question's points.
      it('does not multiply FILL points by its answer length', async () => {
        await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        const q = await createQuestion(subjectId, examId, {
          type: 'FILL',
          options: '1|2|3|4|5|6|7|8|9|0',
          answer: '1234567890',
          difficulty: 5,
          conceptIds: [conceptId],
        });

        const res = await postReply([{ questionId: q.id, repliedAnswer: '1234567890' }]);
        const body = (await res.json()) as PostReplyResponse;
        expect(body[0].score).toBe(10);
        expect(body[0].awardedPoints).toBe(100);
      });
    });

    it('updates question attempCount/scoringTotal/adjustedDifficulty and inserts a reply row', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const q = await createQuestion(subjectId, examId, { difficulty: 5, answer: 'A', conceptIds: [conceptId] });

      await postReply([{ questionId: q.id, repliedAnswer: 'A' }]);

      const db = getDb();
      const [updated] = await db.select().from(questionTable).where(eq(questionTable.id, q.id));
      expect(updated.attempCount).toBe(1);
      expect(updated.scoringTotal).toBe(10);
      // weight = 1/1068 (tiny); adjustedDifficulty ~= (1-weight)*5, just under 5
      expect(updated.adjustedDifficulty).toBeLessThan(5);
      expect(updated.adjustedDifficulty).toBeGreaterThan(4.9);

      const replies = await db.select().from(replyTable).where(eq(replyTable.questionId, q.id));
      expect(replies).toHaveLength(1);
      expect(replies[0]).toMatchObject({
        subjectId,
        parentId: null,
        score: 10,
        repliedAnswer: 'A',
      });
    });

    describe('points', () => {
      it('awards the 100-point baseline on a cold-start correct answer (mastery defaults to the question difficulty)', async () => {
        await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        const q = await createQuestion(subjectId, examId, { difficulty: 5, answer: 'A', conceptIds: [conceptId] });

        const res = await postReply([{ questionId: q.id, repliedAnswer: 'A' }]);
        const body = (await res.json()) as PostReplyResponse;
        expect(body[0].awardedPoints).toBe(100);

        const db = getDb();
        const [replyRow] = await db.select().from(replyTable).where(eq(replyTable.questionId, q.id));
        expect(replyRow.awardedPoints).toBe(100);
      });

      it('awards fewer than baseline points when mastery is far above the question difficulty (an easy win)', async () => {
        const userId = await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        const q = await createQuestion(subjectId, examId, { difficulty: 5, answer: 'A', conceptIds: [conceptId] });
        const db = getDb();
        await db.insert(userConceptStatTable).values({
          userId,
          conceptId,
          attemptCount: 5,
          scoringTotal: 50,
          lastAttemptAt: new Date(),
          weightedSum: 50,
          decaySum: 5,
          mastery: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // gap = 10 - 5 = 5 -> expected ~= 0.9901 -> points = 200*(1-0.9901) ~= 1.98 -> round to 2
        const res = await postReply([{ questionId: q.id, repliedAnswer: 'A' }]);
        const body = (await res.json()) as PostReplyResponse;
        expect(body[0].awardedPoints).toBe(2);
      });

      it('awards more than baseline points when mastery is far below the question difficulty (a hard win)', async () => {
        const userId = await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        const q = await createQuestion(subjectId, examId, { difficulty: 5, answer: 'A', conceptIds: [conceptId] });
        const db = getDb();
        await db.insert(userConceptStatTable).values({
          userId,
          conceptId,
          attemptCount: 5,
          scoringTotal: 0,
          lastAttemptAt: new Date(),
          weightedSum: 0,
          decaySum: 5,
          mastery: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // gap = 0 - 5 = -5 -> expected ~= 0.0099 -> points = 200*(1-0.0099) ~= 198.02 -> round to 198
        const res = await postReply([{ questionId: q.id, repliedAnswer: 'A' }]);
        const body = (await res.json()) as PostReplyResponse;
        expect(body[0].awardedPoints).toBe(198);
      });

      it('awards 0 points for a wrong answer regardless of the mastery/difficulty gap', async () => {
        const userId = await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        const q = await createQuestion(subjectId, examId, { difficulty: 5, answer: 'A', conceptIds: [conceptId] });
        const db = getDb();
        await db.insert(userConceptStatTable).values({
          userId,
          conceptId,
          attemptCount: 5,
          scoringTotal: 0,
          lastAttemptAt: new Date(),
          weightedSum: 0,
          decaySum: 5,
          mastery: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const res = await postReply([{ questionId: q.id, repliedAnswer: 'B' }]);
        const body = (await res.json()) as PostReplyResponse;
        expect(body[0].awardedPoints).toBe(0);
      });

      it('scales partial-credit points proportionally to score', async () => {
        await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        // correct = OXOX, one mismatch -> score 5 (see the MULTIPLE scoring test above)
        const q = await createQuestion(subjectId, examId, {
          type: 'MULTIPLE',
          options: 'A|B|C|D',
          answer: 'OXOX',
          conceptIds: [conceptId],
        });

        // cold start -> baseline 100 at score 10, so score 5 should give half: 50
        const res = await postReply([{ questionId: q.id, repliedAnswer: 'OXOO' }]);
        const body = (await res.json()) as PostReplyResponse;
        expect(body[0].score).toBe(5);
        expect(body[0].awardedPoints).toBe(50);
      });

      it('updates user.totalPoints/lifetimePoints, user_stat_history.dailyPoints, and inserts a point_transaction row', async () => {
        const userId = await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        const q = await createQuestion(subjectId, examId, { difficulty: 5, answer: 'A', conceptIds: [conceptId] });

        await postReply([{ questionId: q.id, repliedAnswer: 'A' }]);

        const db = getDb();
        const [replyRow] = await db.select().from(replyTable).where(eq(replyTable.questionId, q.id));
        expect(replyRow.awardedPoints).toBe(100);

        const [updatedUser] = await db.select().from(userTable).where(eq(userTable.id, userId));
        expect(updatedUser.totalPoints).toBe(100);
        expect(updatedUser.lifetimePoints).toBe(100);

        const today = new Date().toISOString().slice(0, 10);
        const [history] = await db
          .select()
          .from(userStatHistoryTable)
          .where(
            and(
              eq(userStatHistoryTable.userId, userId),
              eq(userStatHistoryTable.subjectId, subjectId),
              eq(userStatHistoryTable.date, today)
            )
          );
        expect(history.dailyPoints).toBe(100);

        const transactions = await db
          .select()
          .from(pointTransactionTable)
          .where(eq(pointTransactionTable.userId, userId));
        expect(transactions).toHaveLength(1);
        expect(transactions[0]).toMatchObject({
          type: 'EARN_REPLY',
          amount: 100,
          replyId: replyRow.id,
          balanceAfter: 100,
        });
      });

      it('accumulates totalPoints/lifetimePoints and balanceAfter across multiple POST /reply calls', async () => {
        const userId = await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        const q1 = await createQuestion(subjectId, examId, { difficulty: 5, answer: 'A', conceptIds: [conceptId] });
        const q2 = await createQuestion(subjectId, examId, { difficulty: 5, answer: 'A', conceptIds: [conceptId] });

        await postReply([{ questionId: q1.id, repliedAnswer: 'A' }]);
        await postReply([{ questionId: q2.id, repliedAnswer: 'A' }]);

        const db = getDb();
        const [updatedUser] = await db.select().from(userTable).where(eq(userTable.id, userId));
        // Not necessarily 200 -- the second reply's mastery snapshot reflects
        // the first reply's upsertConceptStat update, so its gap (and thus
        // its points) differ from the first's cold-start 100. Just assert
        // the running total actually accumulated rather than being reset.
        expect(updatedUser.totalPoints).toBeGreaterThan(100);
        expect(updatedUser.lifetimePoints).toBe(updatedUser.totalPoints);

        const transactions = await db
          .select()
          .from(pointTransactionTable)
          .where(eq(pointTransactionTable.userId, userId))
          .orderBy(pointTransactionTable.id);
        expect(transactions).toHaveLength(2);
        expect(transactions[1].balanceAfter).toBe(updatedUser.totalPoints);
      });

      describe('anti-farming (too-fast answers)', () => {
        it('awards 0 points when answered under the 2s floor, even with no duration_p5_ms yet', async () => {
          await seedUser();
          vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
          const { subjectId, examId, conceptId } = await seedFixture();
          // Fresh question -> durationP5Ms is still null (only the nightly
          // questionStat job sets it), so only the flat 2s floor applies.
          const q = await createQuestion(subjectId, examId, { difficulty: 5, answer: 'A', conceptIds: [conceptId] });

          const res = await postReply([{ questionId: q.id, repliedAnswer: 'A', durationMs: 500 }]);
          const body = (await res.json()) as PostReplyResponse;
          expect(body[0].score).toBe(10);
          expect(body[0].awardedPoints).toBe(0);
        });

        it('awards 0 points when answered faster than 80% of duration_p5_ms, even above the 2s floor', async () => {
          await seedUser();
          vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
          const { subjectId, examId, conceptId } = await seedFixture();
          const q = await createQuestion(subjectId, examId, { difficulty: 5, answer: 'A', conceptIds: [conceptId] });
          const db = getDb();
          // p5 = 10000ms -> threshold = max(10000*0.8, 2000) = 8000ms
          await db.update(questionTable).set({ durationP5Ms: 10000 }).where(eq(questionTable.id, q.id));

          const res = await postReply([{ questionId: q.id, repliedAnswer: 'A', durationMs: 7999 }]);
          const body = (await res.json()) as PostReplyResponse;
          expect(body[0].awardedPoints).toBe(0);
        });

        it('awards normal points once answered at or above the duration_p5_ms threshold', async () => {
          await seedUser();
          vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
          const { subjectId, examId, conceptId } = await seedFixture();
          const q = await createQuestion(subjectId, examId, { difficulty: 5, answer: 'A', conceptIds: [conceptId] });
          const db = getDb();
          await db.update(questionTable).set({ durationP5Ms: 10000 }).where(eq(questionTable.id, q.id));

          const res = await postReply([{ questionId: q.id, repliedAnswer: 'A', durationMs: 8000 }]);
          const body = (await res.json()) as PostReplyResponse;
          expect(body[0].awardedPoints).toBe(100);
        });

        it('does not zero points when durationMs is omitted entirely', async () => {
          await seedUser();
          vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
          const { subjectId, examId, conceptId } = await seedFixture();
          const q = await createQuestion(subjectId, examId, { difficulty: 5, answer: 'A', conceptIds: [conceptId] });

          const res = await postReply([{ questionId: q.id, repliedAnswer: 'A' }]);
          const body = (await res.json()) as PostReplyResponse;
          expect(body[0].awardedPoints).toBe(100);
        });

        it('still awards 0 (not negative) points for a fast wrong answer', async () => {
          await seedUser();
          vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
          const { subjectId, examId, conceptId } = await seedFixture();
          const q = await createQuestion(subjectId, examId, { difficulty: 5, answer: 'A', conceptIds: [conceptId] });

          const res = await postReply([{ questionId: q.id, repliedAnswer: 'B', durationMs: 100 }]);
          const body = (await res.json()) as PostReplyResponse;
          expect(body[0].score).toBe(0);
          expect(body[0].awardedPoints).toBe(0);
        });

        it('persists reply.tooFast=true when the anti-farming gate trips', async () => {
          await seedUser();
          vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
          const { subjectId, examId, conceptId } = await seedFixture();
          const q = await createQuestion(subjectId, examId, { difficulty: 5, answer: 'A', conceptIds: [conceptId] });

          await postReply([{ questionId: q.id, repliedAnswer: 'A', durationMs: 500 }]);

          const db = getDb();
          const [replyRow] = await db.select().from(replyTable).where(eq(replyTable.questionId, q.id));
          expect(replyRow.tooFast).toBe(true);
        });

        it('persists reply.tooFast=false when answered at or above the threshold', async () => {
          await seedUser();
          vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
          const { subjectId, examId, conceptId } = await seedFixture();
          const q = await createQuestion(subjectId, examId, { difficulty: 5, answer: 'A', conceptIds: [conceptId] });

          await postReply([{ questionId: q.id, repliedAnswer: 'A', durationMs: 5000 }]);

          const db = getDb();
          const [replyRow] = await db.select().from(replyTable).where(eq(replyTable.questionId, q.id));
          expect(replyRow.tooFast).toBe(false);
        });
      });

      describe('time-weight', () => {
        it('applies only the subject multiplier when the question is typical for its subject', async () => {
          const userId = await seedUser();
          vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
          const { subjectId, examId, conceptId } = await seedFixture();
          const q = await createQuestion(subjectId, examId, { difficulty: 5, answer: 'A', conceptIds: [conceptId] });
          const db = getDb();
          await db.insert(durationGlobalStatTable).values({ medianMs: 20000 });
          await db.update(subjectTable).set({ durationMedianMs: 60000 }).where(eq(subjectTable.id, subjectId));
          await db.update(questionTable).set({ durationMedianMs: 60000 }).where(eq(questionTable.id, q.id));

          // Cold start (gap=0) -> basePoints=100. withinSubjectRatio =
          // 60000/60000 = 1.0. subjectMultiplier = clamp(60000/20000=3.0,
          // 0.1, 10) = 3.0. timeWeight = 3.0 -> 300.
          const res = await postReply([{ questionId: q.id, repliedAnswer: 'A' }]);
          const body = (await res.json()) as PostReplyResponse;
          expect(body[0].awardedPoints).toBe(300);

          const [updatedUser] = await db.select().from(userTable).where(eq(userTable.id, userId));
          expect(updatedUser.totalPoints).toBe(300);
        });

        it('combines the within-subject ratio and subject multiplier when both differ from 1', async () => {
          await seedUser();
          vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
          const { subjectId, examId, conceptId } = await seedFixture();
          const q = await createQuestion(subjectId, examId, { difficulty: 5, answer: 'A', conceptIds: [conceptId] });
          const db = getDb();
          await db.insert(durationGlobalStatTable).values({ medianMs: 20000 });
          await db.update(subjectTable).set({ durationMedianMs: 60000 }).where(eq(subjectTable.id, subjectId));
          await db.update(questionTable).set({ durationMedianMs: 90000 }).where(eq(questionTable.id, q.id));

          // withinSubjectRatio = clamp(90000/60000=1.5, 0.5, 2.0) = 1.5.
          // subjectMultiplier = clamp(60000/20000=3.0, 0.1, 10) = 3.0.
          // timeWeight = 1.5*3.0 = 4.5 -> basePoints(100) * 4.5 = 450.
          const res = await postReply([{ questionId: q.id, repliedAnswer: 'A' }]);
          const body = (await res.json()) as PostReplyResponse;
          expect(body[0].awardedPoints).toBe(450);
        });

        it('clamps the subject multiplier at the wide [0.1, 10] safety bounds', async () => {
          await seedUser();
          vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
          const { subjectId, examId, conceptId } = await seedFixture();
          const q = await createQuestion(subjectId, examId, { difficulty: 5, answer: 'A', conceptIds: [conceptId] });
          const db = getDb();
          await db.insert(durationGlobalStatTable).values({ medianMs: 20000 });
          // Natural ratio would be 1,000,000/20,000 = 50 -- clamped to 10.
          await db.update(subjectTable).set({ durationMedianMs: 1000000 }).where(eq(subjectTable.id, subjectId));
          await db.update(questionTable).set({ durationMedianMs: 1000000 }).where(eq(questionTable.id, q.id));

          const res = await postReply([{ questionId: q.id, repliedAnswer: 'A' }]);
          const body = (await res.json()) as PostReplyResponse;
          expect(body[0].awardedPoints).toBe(1000);
        });

        it('clamps the within-subject ratio at [0.5, 2.0] even when the subject multiplier is neutral', async () => {
          await seedUser();
          vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
          const { subjectId, examId, conceptId } = await seedFixture();
          const q = await createQuestion(subjectId, examId, { difficulty: 5, answer: 'A', conceptIds: [conceptId] });
          const db = getDb();
          await db.insert(durationGlobalStatTable).values({ medianMs: 20000 });
          await db.update(subjectTable).set({ durationMedianMs: 20000 }).where(eq(subjectTable.id, subjectId));
          // Natural ratio would be 1,000,000/20,000 = 50 -- clamped to 2.0.
          await db.update(questionTable).set({ durationMedianMs: 1000000 }).where(eq(questionTable.id, q.id));

          const res = await postReply([{ questionId: q.id, repliedAnswer: 'A' }]);
          const body = (await res.json()) as PostReplyResponse;
          expect(body[0].awardedPoints).toBe(200);
        });

        it('treats a question with no duration_median_ms yet as neutral for the within-subject layer, still applying the subject multiplier', async () => {
          await seedUser();
          vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
          const { subjectId, examId, conceptId } = await seedFixture();
          const q = await createQuestion(subjectId, examId, { difficulty: 5, answer: 'A', conceptIds: [conceptId] });
          const db = getDb();
          await db.insert(durationGlobalStatTable).values({ medianMs: 20000 });
          await db.update(subjectTable).set({ durationMedianMs: 60000 }).where(eq(subjectTable.id, subjectId));
          // question.durationMedianMs left NULL (never set by createQuestion).

          const res = await postReply([{ questionId: q.id, repliedAnswer: 'A' }]);
          const body = (await res.json()) as PostReplyResponse;
          expect(body[0].awardedPoints).toBe(300);
        });

        it('applies neutral time-weight (1.0) when there is no duration_global_stat row at all', async () => {
          await seedUser();
          vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
          const { subjectId, examId, conceptId } = await seedFixture();
          const q = await createQuestion(subjectId, examId, { difficulty: 5, answer: 'A', conceptIds: [conceptId] });
          const db = getDb();
          // Subject/question medians set, but no duration_global_stat row
          // exists yet (brand-new deployment) -- subjectMultiplier can't
          // be computed without a global anchor, so it falls back to 1.0.
          await db.update(subjectTable).set({ durationMedianMs: 60000 }).where(eq(subjectTable.id, subjectId));
          await db.update(questionTable).set({ durationMedianMs: 90000 }).where(eq(questionTable.id, q.id));

          // withinSubjectRatio = clamp(90000/60000=1.5, 0.5, 2.0) = 1.5.
          // subjectMultiplier = 1.0 (no global stat). timeWeight = 1.5.
          const res = await postReply([{ questionId: q.id, repliedAnswer: 'A' }]);
          const body = (await res.json()) as PostReplyResponse;
          expect(body[0].awardedPoints).toBe(150);
        });
      });
    });

    it('sets parentId and fbPostId from the parent for a GROUP question child', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const [group, child1, child2] = await createGroupQuestion(subjectId, examId, [conceptId], [
        { answer: 'A', options: 'A|B' },
        { answer: 'B', options: 'A|B' },
      ]);
      const db = getDb();
      await db.update(questionTable).set({ fbPostId: 'page_post' }).where(eq(questionTable.id, group.id));

      const res = await postReply([
        { questionId: child1.id, repliedAnswer: 'A' },
        { questionId: child2.id, repliedAnswer: 'A' },
      ]);
      const body = (await res.json()) as PostReplyResponse;
      expect(body.find((r) => r.questionId === child1.id)).toMatchObject({ fbPostId: 'page_post', score: 10 });
      expect(body.find((r) => r.questionId === child2.id)).toMatchObject({ fbPostId: 'page_post', score: 0 });

      const replies = await db.select().from(replyTable).where(eq(replyTable.questionId, child1.id));
      expect(replies[0].parentId).toBe(group.id);
    });

    it("recomputes a GROUP question's adjustedDifficulty as the average of its children", async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const [group, child1, child2] = await createGroupQuestion(subjectId, examId, [conceptId], [
        { answer: 'A', options: 'A|B' },
        { answer: 'A', options: 'A|B' },
      ]);

      await postReply([
        { questionId: child1.id, repliedAnswer: 'A' },
        { questionId: child2.id, repliedAnswer: 'B' },
      ]);

      const db = getDb();
      const [updatedGroup] = await db.select().from(questionTable).where(eq(questionTable.id, group.id));
      const [updatedChild1] = await db.select().from(questionTable).where(eq(questionTable.id, child1.id));
      const [updatedChild2] = await db.select().from(questionTable).where(eq(questionTable.id, child2.id));
      const expectedAvg = (updatedChild1.adjustedDifficulty + updatedChild2.adjustedDifficulty) / 2;
      expect(updatedGroup.adjustedDifficulty).toBeCloseTo(expectedAvg, 10);
    });

    it('creates a user_concept_stat row on first attempt and updates it on the second', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const q = await createQuestion(subjectId, examId, { answer: 'A', conceptIds: [conceptId] });

      await postReply([{ questionId: q.id, repliedAnswer: 'A' }]);
      const db = getDb();
      const [user] = await db.select().from(userTable).where(eq(userTable.firebaseUid, 'fixture-uid'));
      const [firstStat] = await db
        .select()
        .from(userConceptStatTable)
        .where(eq(userConceptStatTable.conceptId, conceptId));
      expect(firstStat).toMatchObject({ userId: user.id, attemptCount: 1, scoringTotal: 10 });
      expect(firstStat.mastery).toBeGreaterThan(0);

      await postReply([{ questionId: q.id, repliedAnswer: 'B' }]);
      const [secondStat] = await db
        .select()
        .from(userConceptStatTable)
        .where(eq(userConceptStatTable.conceptId, conceptId));
      expect(secondStat.attemptCount).toBe(2);
      expect(secondStat.scoringTotal).toBe(10);
    });

    it('clears pending_reply rows for answered questions', async () => {
      const userId = await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const q = await createQuestion(subjectId, examId, { answer: 'A', conceptIds: [conceptId] });
      const db = getDb();
      await db.insert(pendingReplyTable).values({ questionId: q.id, userId, createdAt: new Date(), updatedAt: new Date() });

      await postReply([{ questionId: q.id, repliedAnswer: 'A' }]);

      const remaining = await db.select().from(pendingReplyTable).where(eq(pendingReplyTable.questionId, q.id));
      expect(remaining).toHaveLength(0);
    });

    it('upserts a daily user_stat_history row, accumulating across batches on the same day', async () => {
      const userId = await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const q = await createQuestion(subjectId, examId, { answer: 'A', conceptIds: [conceptId] });

      await postReply([{ questionId: q.id, repliedAnswer: 'A' }]);
      await postReply([{ questionId: q.id, repliedAnswer: 'B' }]);

      const db = getDb();
      const rows = await db
        .select()
        .from(userStatHistoryTable)
        .where(eq(userStatHistoryTable.userId, userId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ subjectId, dailyAttempts: 2, dailyCorrect: 10 });
    });

    it('silently skips an unknown questionId instead of erroring', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const q = await createQuestion(subjectId, examId, { answer: 'A', conceptIds: [conceptId] });

      const res = await postReply([
        { questionId: q.id, repliedAnswer: 'A' },
        { questionId: 999999, repliedAnswer: 'A' },
      ]);
      expect(res.status).toBe(200);
      const body = (await res.json()) as PostReplyResponse;
      expect(body).toHaveLength(1);
      expect(body[0].questionId).toBe(q.id);
    });

    it('adds a user_wrong_question row when the answer scores below 10', async () => {
      const userId = await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const q = await createQuestion(subjectId, examId, { answer: 'A', conceptIds: [conceptId] });

      await postReply([{ questionId: q.id, repliedAnswer: 'B' }]);

      const db = getDb();
      const rows = await db
        .select()
        .from(userWrongQuestionTable)
        .where(eq(userWrongQuestionTable.questionId, q.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ userId, questionId: q.id, parentId: null, subjectId, score: 0, wrongCount: 1, note: null });
      expect(rows[0].lastWrongAt).toBeInstanceOf(Date);
    });

    it('does not add a user_wrong_question row for a fully-correct answer', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const q = await createQuestion(subjectId, examId, { answer: 'A', conceptIds: [conceptId] });

      await postReply([{ questionId: q.id, repliedAnswer: 'A' }]);

      const db = getDb();
      const rows = await db
        .select()
        .from(userWrongQuestionTable)
        .where(eq(userWrongQuestionTable.questionId, q.id));
      expect(rows).toEqual([]);
    });

    it('records a GROUP question child as wrong with parentId set to the group', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const [group, child1, child2] = await createGroupQuestion(subjectId, examId, [conceptId], [
        { answer: 'A', options: 'A|B' },
        { answer: 'A', options: 'A|B' },
      ]);

      await postReply([
        { questionId: child1.id, repliedAnswer: 'A' }, // correct
        { questionId: child2.id, repliedAnswer: 'B' }, // wrong
      ]);

      const db = getDb();
      const rows = await db.select().from(userWrongQuestionTable).where(eq(userWrongQuestionTable.subjectId, subjectId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ questionId: child2.id, parentId: group.id });
    });

    it('bumps wrongCount, score, and lastWrongAt without touching the row id, note, or createdAt when answered wrong again', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      // correct = OXOX; the two wrong answers below deliberately land on
      // different partial scores (5, then 0) so the test can tell the row
      // is really being recomputed from the latest attempt, not just left
      // alone or reset to a fixed value.
      const q = await createQuestion(subjectId, examId, {
        type: 'MULTIPLE',
        options: 'A|B|C|D',
        answer: 'OXOX',
        conceptIds: [conceptId],
      });

      await postReply([{ questionId: q.id, repliedAnswer: 'OXOO' }]); // 1 mismatch -> score 5
      const db = getDb();
      const [firstRow] = await db
        .select()
        .from(userWrongQuestionTable)
        .where(eq(userWrongQuestionTable.questionId, q.id));
      expect(firstRow).toMatchObject({ score: 5, wrongCount: 1 });
      await db.update(userWrongQuestionTable).set({ note: 'remember this one' }).where(eq(userWrongQuestionTable.id, firstRow.id));

      await postReply([{ questionId: q.id, repliedAnswer: 'XXOO' }]); // 2 mismatches -> score 0

      const rows = await db.select().from(userWrongQuestionTable).where(eq(userWrongQuestionTable.questionId, q.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: firstRow.id, score: 0, wrongCount: 2, note: 'remember this one' });
      expect(rows[0].createdAt?.getTime()).toBe(firstRow.createdAt?.getTime());
      expect(rows[0].lastWrongAt.getTime()).toBeGreaterThanOrEqual(firstRow.lastWrongAt.getTime());
    });

    it('leaves the user_wrong_question row (including score/wrongCount/lastWrongAt) unchanged after a later correct answer', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const q = await createQuestion(subjectId, examId, { answer: 'A', conceptIds: [conceptId] });

      await postReply([{ questionId: q.id, repliedAnswer: 'B' }]);
      const db = getDb();
      const [wrongRow] = await db
        .select()
        .from(userWrongQuestionTable)
        .where(eq(userWrongQuestionTable.questionId, q.id));

      await postReply([{ questionId: q.id, repliedAnswer: 'A' }]);

      const rows = await db
        .select()
        .from(userWrongQuestionTable)
        .where(eq(userWrongQuestionTable.questionId, q.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: wrongRow.id, score: wrongRow.score, wrongCount: wrongRow.wrongCount });
      expect(rows[0].lastWrongAt.getTime()).toBe(wrongRow.lastWrongAt.getTime());
    });
  });

  describe('GET /', () => {
    it('rejects with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdTokenUid).mockResolvedValue(null);
      const res = await getReplyList();
      expect(res.status).toBe(401);
    });

    it('groups two standalone questions answered in the same batch into two separate rows', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, tagId, conceptId } = await seedFixture();
      const q1 = await createQuestion(subjectId, examId, { answer: 'A', tagIds: [tagId], conceptIds: [conceptId] });
      const q2 = await createQuestion(subjectId, examId, { answer: 'A', conceptIds: [conceptId] });

      await postReply([
        { questionId: q1.id, repliedAnswer: 'A' },
        { questionId: q2.id, repliedAnswer: 'B' },
      ]);

      const res = await getReplyList();
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: ReplyGroupDto[]; paginate: { total: number } };
      expect(body.paginate.total).toBe(2);
      expect(body.data).toHaveLength(2);
      const group1 = body.data.find((g) => g.children[0].questionId === q1.id)!;
      expect(group1.parentQuestion).toBeNull();
      expect(group1.subject.name).toBe('fixture subject');
      expect(group1.children[0]).toMatchObject({ score: 10, repliedAnswer: 'A' });
      expect(group1.children[0].question.tag.map((t) => t.id)).toEqual([tagId]);
    });

    it("groups a GROUP question's children answered together into one row", async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const [group, child1, child2] = await createGroupQuestion(subjectId, examId, [conceptId], [
        { answer: 'A', options: 'A|B' },
        { answer: 'A', options: 'A|B' },
      ]);

      await postReply([
        { questionId: child1.id, repliedAnswer: 'A' },
        { questionId: child2.id, repliedAnswer: 'B' },
      ]);

      const res = await getReplyList();
      const body = (await res.json()) as { data: ReplyGroupDto[]; paginate: { total: number } };
      expect(body.data).toHaveLength(1);
      expect(body.data[0].parentQuestion?.id).toBe(group.id);
      expect(body.data[0].children.map((c) => c.questionId).sort()).toEqual([child1.id, child2.id].sort());
    });

    // The 討論區 link on the history page is built from this field alone,
    // so a response that omits it renders a permanently disabled button
    // that no amount of correct data can light up -- and nothing fails,
    // because the frontend's own type says the field is there. Asserting
    // the shape is the only thing that catches it.
    it('returns fbPostId for a standalone question', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const q = await createQuestion(subjectId, examId, { answer: 'A', conceptIds: [conceptId] });
      await getDb()
        .update(questionTable)
        .set({ fbPostId: '1122334455_9988776655' })
        .where(eq(questionTable.id, q.id));

      await postReply([{ questionId: q.id, repliedAnswer: 'A' }]);

      const res = await getReplyList();
      const body = (await res.json()) as { data: ReplyGroupDto[] };
      expect(body.data[0].children[0].question.fbPostId).toBe('1122334455_9988776655');
    });

    // facebookPoster renders a group and its children into a single image
    // and writes the id back to the parent row, so the children keep a
    // null of their own. The history page reads the parent for a group,
    // which only works if the parent's value survives the response.
    it("returns the parent's fbPostId for a GROUP question, children staying null", async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const [group, child1, child2] = await createGroupQuestion(subjectId, examId, [conceptId], [
        { answer: 'A', options: 'A|B' },
        { answer: 'A', options: 'A|B' },
      ]);
      await getDb()
        .update(questionTable)
        .set({ fbPostId: '1122334455_5566778899' })
        .where(eq(questionTable.id, group.id));

      await postReply([
        { questionId: child1.id, repliedAnswer: 'A' },
        { questionId: child2.id, repliedAnswer: 'A' },
      ]);

      const res = await getReplyList();
      const body = (await res.json()) as { data: ReplyGroupDto[] };
      expect(body.data[0].parentQuestion?.fbPostId).toBe('1122334455_5566778899');
      expect(body.data[0].children[0].question.fbPostId).toBeNull();
    });

    it('paginates across separately-submitted batches, newest first', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const q1 = await createQuestion(subjectId, examId, { answer: 'A', conceptIds: [conceptId] });
      const q2 = await createQuestion(subjectId, examId, { answer: 'A', conceptIds: [conceptId] });
      const q3 = await createQuestion(subjectId, examId, { answer: 'A', conceptIds: [conceptId] });

      await postReply([{ questionId: q1.id, repliedAnswer: 'A' }]);
      await postReply([{ questionId: q2.id, repliedAnswer: 'A' }]);
      await postReply([{ questionId: q3.id, repliedAnswer: 'A' }]);

      const page1 = await getReplyList('?limit=2&offset=0');
      const page1Body = (await page1.json()) as { data: ReplyGroupDto[]; paginate: { total: number; totalPages: number } };
      expect(page1Body.paginate.total).toBe(3);
      expect(page1Body.paginate.totalPages).toBe(2);
      expect(page1Body.data.map((g) => g.children[0].questionId)).toEqual([q3.id, q2.id]);

      const page2 = await getReplyList('?limit=2&offset=2');
      const page2Body = (await page2.json()) as { data: ReplyGroupDto[] };
      expect(page2Body.data.map((g) => g.children[0].questionId)).toEqual([q1.id]);
    });

    it('returns an empty page with correct pagination when the user has no replies', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');

      const res = await getReplyList();
      const body = (await res.json()) as { data: ReplyGroupDto[]; paginate: { total: number; totalPages: number } };
      expect(body.data).toEqual([]);
      expect(body.paginate).toMatchObject({ total: 0, totalPages: 1 });
    });

    describe('?categoryId=', () => {
      it('only returns replies for subjects linked to the given category', async () => {
        await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        const q1 = await createQuestion(subjectId, examId, { answer: 'A', conceptIds: [conceptId] });

        const db = getDb();
        const [{ insertId: categoryId }] = await db
          .insert(categoryTable)
          .values({ name: 'fixture category', createdAt: new Date() });
        await db.insert(subjectCategoryTable).values({ categoryId, subjectId });

        const [{ insertId: otherSubjectId }] = await db
          .insert(subjectTable)
          .values({ name: 'other subject', createdAt: new Date() });
        await db.insert(examSubjectTable).values({ examId, subjectId: otherSubjectId });
        const [{ insertId: otherGroupId }] = await db
          .insert(conceptGroupTable)
          .values({ name: 'other group', subjectId: otherSubjectId, createdAt: new Date() });
        const [{ insertId: otherConceptId }] = await db
          .insert(conceptTable)
          .values({ name: 'other concept', conceptGroupId: otherGroupId, createdAt: new Date() });
        const q2 = await createQuestion(otherSubjectId, examId, { answer: 'A', conceptIds: [otherConceptId] });
        // otherSubjectId is deliberately left out of subject_category -- it
        // belongs to no category, so it must never match a categoryId filter.

        await postReply([
          { questionId: q1.id, repliedAnswer: 'A' },
          { questionId: q2.id, repliedAnswer: 'A' },
        ]);

        const res = await getReplyList(`?categoryId=${categoryId}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: ReplyGroupDto[]; paginate: { total: number } };
        expect(body.paginate.total).toBe(1);
        expect(body.data[0].children[0].questionId).toBe(q1.id);
      });

      it('returns an empty page for a category with no linked subjects', async () => {
        await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        const q = await createQuestion(subjectId, examId, { answer: 'A', conceptIds: [conceptId] });
        await postReply([{ questionId: q.id, repliedAnswer: 'A' }]);

        const db = getDb();
        const [{ insertId: emptyCategoryId }] = await db
          .insert(categoryTable)
          .values({ name: 'empty category', createdAt: new Date() });

        const res = await getReplyList(`?categoryId=${emptyCategoryId}`);
        const body = (await res.json()) as { data: ReplyGroupDto[]; paginate: { total: number } };
        expect(body.data).toEqual([]);
        expect(body.paginate.total).toBe(0);
      });
    });

    describe('?subjectId=', () => {
      it('only returns replies belonging to the given subject', async () => {
        await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        const q1 = await createQuestion(subjectId, examId, { answer: 'A', conceptIds: [conceptId] });

        const db = getDb();
        const [{ insertId: otherSubjectId }] = await db
          .insert(subjectTable)
          .values({ name: 'other subject', createdAt: new Date() });
        await db.insert(examSubjectTable).values({ examId, subjectId: otherSubjectId });
        const [{ insertId: otherGroupId }] = await db
          .insert(conceptGroupTable)
          .values({ name: 'other group', subjectId: otherSubjectId, createdAt: new Date() });
        const [{ insertId: otherConceptId }] = await db
          .insert(conceptTable)
          .values({ name: 'other concept', conceptGroupId: otherGroupId, createdAt: new Date() });
        const q2 = await createQuestion(otherSubjectId, examId, { answer: 'A', conceptIds: [otherConceptId] });

        await postReply([
          { questionId: q1.id, repliedAnswer: 'A' },
          { questionId: q2.id, repliedAnswer: 'A' },
        ]);

        const res = await getReplyList(`?subjectId=${subjectId}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: ReplyGroupDto[]; paginate: { total: number } };
        expect(body.paginate.total).toBe(1);
        expect(body.data[0].children[0].questionId).toBe(q1.id);
      });
    });

    describe('?examIds=', () => {
      it("only returns replies whose top-level question is linked to the given exam", async () => {
        await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        const db = getDb();
        const [{ insertId: otherExamId }] = await db
          .insert(examTable)
          .values({ name: 'other exam', createdAt: new Date() });
        await db.insert(examSubjectTable).values({ examId: otherExamId, subjectId });

        const q1 = await createQuestion(subjectId, examId, { answer: 'A', conceptIds: [conceptId] });
        const q2 = await createQuestion(subjectId, otherExamId, { answer: 'A', conceptIds: [conceptId] });

        await postReply([
          { questionId: q1.id, repliedAnswer: 'A' },
          { questionId: q2.id, repliedAnswer: 'A' },
        ]);

        const res = await getReplyList(`?examIds=${examId}`);
        const body = (await res.json()) as { data: ReplyGroupDto[]; paginate: { total: number } };
        expect(body.paginate.total).toBe(1);
        expect(body.data[0].children[0].questionId).toBe(q1.id);
      });

      it("keeps every child of a matching GROUP question, since the exam link lives only on the group's top-level row", async () => {
        await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        const [group, child1, child2] = await createGroupQuestion(subjectId, examId, [conceptId], [
          { answer: 'A', options: 'A|B' },
          { answer: 'A', options: 'A|B' },
        ]);

        await postReply([
          { questionId: child1.id, repliedAnswer: 'A' },
          { questionId: child2.id, repliedAnswer: 'B' },
        ]);

        const res = await getReplyList(`?examIds=${examId}`);
        const body = (await res.json()) as { data: ReplyGroupDto[] };
        expect(body.data).toHaveLength(1);
        expect(body.data[0].parentQuestion?.id).toBe(group.id);
        expect(body.data[0].children.map((c) => c.questionId).sort()).toEqual([child1.id, child2.id].sort());
      });
    });

    describe('?tagIds=', () => {
      it('only returns replies whose top-level question carries the given tag', async () => {
        await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, tagId, conceptId } = await seedFixture();
        const q1 = await createQuestion(subjectId, examId, { answer: 'A', tagIds: [tagId], conceptIds: [conceptId] });
        const q2 = await createQuestion(subjectId, examId, { answer: 'A', conceptIds: [conceptId] });

        await postReply([
          { questionId: q1.id, repliedAnswer: 'A' },
          { questionId: q2.id, repliedAnswer: 'A' },
        ]);

        const res = await getReplyList(`?tagIds=${tagId}`);
        const body = (await res.json()) as { data: ReplyGroupDto[]; paginate: { total: number } };
        expect(body.paginate.total).toBe(1);
        expect(body.data[0].children[0].questionId).toBe(q1.id);
      });
    });
  });

  /**
   * What the OpenAPI document promises, against what is sent.
   *
   * The key checks are separate from the parse because zod strips
   * unknown keys instead of rejecting them, and the handler's
   * `satisfies` does not catch an extra one either: a row with
   * properties the schema does not mention is still assignable to it.
   *
   * The embedded question is the point of the key list below. It is the
   * one shape three responses share, and packages/shared's `Question`
   * claims six fields it has never carried -- `subject`, `enabled`,
   * `attempCount`, `scoringTotal` and both timestamps.
   */
  describe('the OpenAPI document', () => {
      const questionKeys = [
        'adjustedDifficulty',
        'answer',
        'children',
        'concept',
        'content',
        'difficulty',
        'exam',
        'fbPostId',
        'id',
        'isGroup',
        'options',
        'parentId',
        'sortOrder',
        'subjectId',
        'tag',
        'type',
        'uuid',
      ];

    it('describes exactly what submitting answers sends', async () => {
      await seedUser();
      const { subjectId, examId, conceptId } = await seedFixture();
      const question = await createQuestion(subjectId, examId, { conceptIds: [conceptId] });
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');

      const body: unknown = await (
        await postReply([{ questionId: question.id, repliedAnswer: 'A' }])
      ).json();

      const parsed = postReplyResponseSchema.safeParse(body);
      expect(parsed.error?.issues ?? []).toEqual([]);
      expect(parsed.success).toBe(true);
      expect(Object.keys((body as object[])[0]).sort()).toEqual([
        'awardedPoints',
        'correctAnswer',
        'fbPostId',
        'questionId',
        'repliedAnswer',
        'score',
      ]);
    });

    it('describes exactly what the history sends, embedded question and all', async () => {
      await seedUser();
      const { subjectId, examId, tagId, conceptId } = await seedFixture();
      // The first element is the 題組 itself; only its children are
      // answerable, which is the whole reason a history row is a group.
      const [, child1, child2] = await createGroupQuestion(subjectId, examId, [conceptId], [
        { answer: 'A', options: 'A|B' },
        { answer: 'B', options: 'A|B' },
      ]);
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      await postReply([
        { questionId: child1.id, repliedAnswer: 'A' },
        { questionId: child2.id, repliedAnswer: 'A' },
      ]);

      const body: unknown = await (await getReplyList()).json();

      const parsed = getReplyResponseSchema.safeParse(body);
      expect(parsed.error?.issues ?? []).toEqual([]);
      expect(parsed.success).toBe(true);
      expect(Object.keys(body as object).sort()).toEqual(['data', 'paginate']);

      const [group] = (body as {
        data: {
          subject: object;
          parentQuestion: { concept: object[] };
          children: { question: { concept: object[]; children: object[] } }[];
        }[];
      }).data;
      expect(Object.keys(group).sort()).toEqual([
        'children',
        'parentQuestion',
        'repliedAt',
        'subject',
        'subjectId',
      ]);
      // An id and a name, not the Subject type shared claims -- which
      // would drag its exams, tags, concept groups and category along.
      expect(Object.keys(group.subject).sort()).toEqual(['id', 'name']);
      expect(Object.keys(group.parentQuestion).sort()).toEqual(questionKeys);

      const [child] = group.children;
      expect(Object.keys(child).sort()).toEqual([
        'createdAt',
        'id',
        'parentId',
        'question',
        'questionId',
        'repliedAnswer',
        'score',
      ]);
      expect(Object.keys(child.question).sort()).toEqual(questionKeys);
      // The concept links live on the top-level row, so they are on the
      // parent and the sub-question's own arrays are empty -- the shape
      // is the same either way, which is what the schema describes.
      expect(Object.keys(group.parentQuestion.concept[0]).sort()).toEqual([
        'conceptGroup',
        'id',
        'name',
      ]);
      expect(child.question.concept).toEqual([]);
      expect(child.question.children).toEqual([]);
      expect(tagId).toEqual(expect.any(Number));
    });
  });
});
