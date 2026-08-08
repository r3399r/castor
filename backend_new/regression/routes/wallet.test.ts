import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
import {
  conceptGroupTable,
  conceptTable,
  examSubjectTable,
  examTable,
  pointTransactionTable,
  questionConceptTable,
  questionExamTable,
  questionTable,
  replyTable,
  subjectTable,
  userConceptStatTable,
  userStatHistoryTable,
  userTable,
  userWrongQuestionTable,
} from 'src/db/schema';
import { ADMIN_EMAILS } from 'src/middleware/adminAuth';

// Two separate identities: verifyIdToken backs the admin-only POST
// /api/question used to seed fixture questions, verifyIdTokenUid backs
// both /api/reply's (to earn points) and /api/wallet's own requireUser gate.
vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdToken: vi.fn(), verifyIdTokenUid: vi.fn() }));
import { verifyIdToken, verifyIdTokenUid } from 'src/lib/firebaseAdmin';

vi.mock('src/lib/facebookEventBridge', () => ({ enableFacebookEventBridge: vi.fn() }));

type QuestionDto = { id: number };

type PointTransactionDto = {
  id: number;
  type: string;
  amount: number;
  replyId: number | null;
  balanceAfter: number;
  createdAt: string | null;
};

type GetWalletResponse = { data: PointTransactionDto[]; paginate: { total: number; page: number; totalPages: number } };

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

const getWallet = (query = '') => app.request(`/api/wallet${query}`);

const createQuestion = async (subjectId: number, examId: number, conceptId: number) => {
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
        conceptIds: [conceptId],
      },
    ],
  });
  const body = (await res.json()) as QuestionDto[][];
  return body[0][0];
};

const clearTables = async () => {
  const db = getDb();
  await db.delete(pointTransactionTable);
  await db.delete(userWrongQuestionTable);
  await db.delete(replyTable);
  await db.delete(userConceptStatTable);
  await db.delete(userStatHistoryTable);
  await db.delete(questionConceptTable);
  await db.delete(questionExamTable);
  await db.update(questionTable).set({ parentId: null });
  await db.delete(questionTable);
  await db.delete(conceptTable);
  await db.delete(conceptGroupTable);
  await db.delete(examSubjectTable);
  await db.delete(examTable);
  await db.delete(subjectTable);
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
  const [{ insertId: groupId }] = await db
    .insert(conceptGroupTable)
    .values({ name: 'fixture group', subjectId, createdAt: new Date() });
  const [{ insertId: conceptId }] = await db
    .insert(conceptTable)
    .values({ name: 'fixture concept', conceptGroupId: groupId, createdAt: new Date() });
  return { subjectId, examId, conceptId };
};

const seedUser = async (firebaseUid = 'fixture-uid') => {
  const db = getDb();
  const [{ insertId: userId }] = await db.insert(userTable).values({
    firebaseUid,
    email: `${firebaseUid}@example.com`,
    name: 'fixture user',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return userId;
};

describe('wallet routes', () => {
  beforeAll(clearTables);

  beforeEach(() => {
    vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);
  });

  afterEach(clearTables);

  afterAll(async () => {
    await closeDb();
  });

  describe('GET /', () => {
    it('rejects with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdTokenUid).mockResolvedValue(null);
      const res = await getWallet();
      expect(res.status).toBe(401);
    });

    it('returns an empty page when the user has no transactions yet', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');

      const res = await getWallet();
      expect(res.status).toBe(200);
      const body = (await res.json()) as GetWalletResponse;
      expect(body.data).toHaveLength(0);
      expect(body.paginate.total).toBe(0);
    });

    it('lists a point_transaction row created by answering correctly, most recent first', async () => {
      const userId = await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const q1 = await createQuestion(subjectId, examId, conceptId);
      const q2 = await createQuestion(subjectId, examId, conceptId);

      await postReply([{ questionId: q1.id, repliedAnswer: 'A' }]);
      await postReply([{ questionId: q2.id, repliedAnswer: 'A' }]);

      const res = await getWallet();
      const body = (await res.json()) as GetWalletResponse;
      expect(body.data).toHaveLength(2);
      // Most recent (second reply) first.
      const db = getDb();
      const [reply2] = await db.select().from(replyTable).where(eq(replyTable.questionId, q2.id));
      expect(body.data[0]).toMatchObject({
        type: 'EARN_REPLY',
        amount: reply2.awardedPoints,
        replyId: reply2.id,
        balanceAfter: reply2.awardedPoints + body.data[1].amount,
      });

      const [updatedUser] = await db.select().from(userTable).where(eq(userTable.id, userId));
      expect(body.data[0].balanceAfter).toBe(updatedUser.totalPoints);
    });

    it('does not create a transaction row for a wrong answer (0 points)', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const q = await createQuestion(subjectId, examId, conceptId);

      await postReply([{ questionId: q.id, repliedAnswer: 'B' }]);

      const res = await getWallet();
      const body = (await res.json()) as GetWalletResponse;
      expect(body.data).toHaveLength(0);
    });

    it('only returns the requesting user\'s own transactions', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      const q1 = await createQuestion(subjectId, examId, conceptId);
      const q2 = await createQuestion(subjectId, examId, conceptId);

      await seedUser('user-a');
      vi.mocked(verifyIdTokenUid).mockResolvedValue('user-a');
      await postReply([{ questionId: q1.id, repliedAnswer: 'A' }]);

      await seedUser('user-b');
      vi.mocked(verifyIdTokenUid).mockResolvedValue('user-b');
      await postReply([{ questionId: q2.id, repliedAnswer: 'A' }]);

      const res = await getWallet();
      const body = (await res.json()) as GetWalletResponse;
      expect(body.data).toHaveLength(1);
    });

    it('paginates with limit/offset', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      for (let i = 0; i < 3; i++) {
        const q = await createQuestion(subjectId, examId, conceptId);
        await postReply([{ questionId: q.id, repliedAnswer: 'A' }]);
      }

      const res = await getWallet('?limit=2&offset=0');
      const body = (await res.json()) as GetWalletResponse;
      expect(body.data).toHaveLength(2);
      expect(body.paginate).toMatchObject({ total: 3, page: 1, totalPages: 2 });
    });
  });
});
