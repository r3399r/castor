import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
import {
  categoryTable,
  conceptGroupTable,
  conceptTable,
  examSubjectTable,
  examTable,
  pendingReplyTable,
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

// Two separate identities are exercised here: verifyIdToken backs the
// admin-only POST /api/question used to seed fixture questions, and
// verifyIdTokenUid backs /api/wrong-question's own requireUser gate.
vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdToken: vi.fn(), verifyIdTokenUid: vi.fn() }));
import { verifyIdToken, verifyIdTokenUid } from 'src/lib/firebaseAdmin';

vi.mock('src/lib/facebookEventBridge', () => ({ enableFacebookEventBridge: vi.fn() }));

type QuestionDto = { id: number };

type QuestionDetailDto = { id: number };

type WrongQuestionDto = {
  id: number;
  parentQuestion: QuestionDetailDto | null;
  question: QuestionDetailDto;
  subject: { id: number; name: string };
  subjectId: number;
  score: number;
  wrongCount: number;
  lastWrongAt: string | null;
  note: string | null;
  createdAt: string | null;
  updatedAt: string | null;
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

const getWrongQuestionList = (query = '') => app.request(`/api/wrong-question${query}`);

const putWrongQuestionNote = (id: number, note: string | null) =>
  app.request(`/api/wrong-question/${id}/note`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  });

const deleteWrongQuestion = (id: number) =>
  app.request(`/api/wrong-question/${id}`, { method: 'DELETE' });

const createQuestion = async (
  subjectId: number,
  examId: number,
  overrides: Partial<{ answer: string; options: string; conceptIds: number[]; tagIds: number[] }> & {
    conceptIds: number[];
  }
) => {
  const res = await postQuestions({
    subjectId,
    examId,
    questions: [
      { type: 'SINGLE', content: 'question content', options: 'A|B', answer: 'A', difficulty: 5, ...overrides },
    ],
  });
  const body = (await res.json()) as QuestionDto[][];
  return body[0][0];
};

const clearTables = async () => {
  const db = getDb();
  await db.delete(pendingReplyTable);
  await db.delete(userWrongQuestionTable);
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

// Wrong-question rows are only ever created as a side effect of POST
// /reply (there's no create endpoint), so every fixture here answers a
// question incorrectly through the real reply flow rather than inserting
// directly into user_wrong_question.
const seedWrongQuestion = async (
  subjectId: number,
  examId: number,
  conceptId: number,
  overrides: Partial<{ tagIds: number[] }> = {}
) => {
  const q = await createQuestion(subjectId, examId, { answer: 'A', conceptIds: [conceptId], ...overrides });
  await postReply([{ questionId: q.id, repliedAnswer: 'B' }]);
  return q;
};

describe('wrongQuestion routes', () => {
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
      const res = await getWrongQuestionList();
      expect(res.status).toBe(401);
    });

    it("lists only the requesting user's wrong questions", async () => {
      await seedUser('fixture-uid');
      await seedUser('other-uid');
      const { subjectId, examId, conceptId } = await seedFixture();

      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const mine = await seedWrongQuestion(subjectId, examId, conceptId);
      vi.mocked(verifyIdTokenUid).mockResolvedValue('other-uid');
      await seedWrongQuestion(subjectId, examId, conceptId);

      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const res = await getWrongQuestionList();
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: WrongQuestionDto[]; paginate: { total: number } };
      expect(body.paginate.total).toBe(1);
      expect(body.data[0].question.id).toBe(mine.id);
      expect(body.data[0].subject.name).toBe('fixture subject');
      expect(body.data[0]).toMatchObject({ score: 0, wrongCount: 1, note: null });
      expect(body.data[0].lastWrongAt).not.toBeNull();
    });

    it('returns newest-first and paginates', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const q1 = await seedWrongQuestion(subjectId, examId, conceptId);
      const q2 = await seedWrongQuestion(subjectId, examId, conceptId);

      const res = await getWrongQuestionList('?limit=1&offset=0');
      const body = (await res.json()) as { data: WrongQuestionDto[]; paginate: { total: number; totalPages: number } };
      expect(body.paginate).toMatchObject({ total: 2, totalPages: 2 });
      expect(body.data).toHaveLength(1);
      expect(body.data[0].question.id).toBe(q2.id);

      const page2 = await getWrongQuestionList('?limit=1&offset=1');
      const page2Body = (await page2.json()) as { data: WrongQuestionDto[] };
      expect(page2Body.data[0].question.id).toBe(q1.id);
    });

    it('returns an empty page when the user has no wrong questions', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');

      const res = await getWrongQuestionList();
      const body = (await res.json()) as { data: WrongQuestionDto[]; paginate: { total: number } };
      expect(body.data).toEqual([]);
      expect(body.paginate.total).toBe(0);
    });

    describe('?categoryId=', () => {
      it('only returns wrong questions for subjects linked to the given category', async () => {
        await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        const q1 = await seedWrongQuestion(subjectId, examId, conceptId);

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
        // otherSubjectId is deliberately left out of subject_category.
        await seedWrongQuestion(otherSubjectId, examId, otherConceptId);

        const res = await getWrongQuestionList(`?categoryId=${categoryId}`);
        const body = (await res.json()) as { data: WrongQuestionDto[]; paginate: { total: number } };
        expect(body.paginate.total).toBe(1);
        expect(body.data[0].question.id).toBe(q1.id);
      });
    });

    describe('?subjectId=', () => {
      it('only returns wrong questions belonging to the given subject', async () => {
        await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        const q1 = await seedWrongQuestion(subjectId, examId, conceptId);

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
        await seedWrongQuestion(otherSubjectId, examId, otherConceptId);

        const res = await getWrongQuestionList(`?subjectId=${subjectId}`);
        const body = (await res.json()) as { data: WrongQuestionDto[]; paginate: { total: number } };
        expect(body.paginate.total).toBe(1);
        expect(body.data[0].question.id).toBe(q1.id);
      });
    });

    describe('?examIds=', () => {
      it('only returns wrong questions linked to the given exam', async () => {
        await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        const db = getDb();
        const [{ insertId: otherExamId }] = await db
          .insert(examTable)
          .values({ name: 'other exam', createdAt: new Date() });
        await db.insert(examSubjectTable).values({ examId: otherExamId, subjectId });

        const q1 = await seedWrongQuestion(subjectId, examId, conceptId);
        await seedWrongQuestion(subjectId, otherExamId, conceptId);

        const res = await getWrongQuestionList(`?examIds=${examId}`);
        const body = (await res.json()) as { data: WrongQuestionDto[]; paginate: { total: number } };
        expect(body.paginate.total).toBe(1);
        expect(body.data[0].question.id).toBe(q1.id);
      });
    });

    describe('?tagIds=', () => {
      it('only returns wrong questions carrying the given tag', async () => {
        await seedUser();
        vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
        const { subjectId, examId, conceptId } = await seedFixture();
        const db = getDb();
        const [{ insertId: tagId }] = await db
          .insert(tagTable)
          .values({ name: 'fixture tag', subjectId, createdAt: new Date() });

        const q1 = await seedWrongQuestion(subjectId, examId, conceptId, { tagIds: [tagId] });
        await seedWrongQuestion(subjectId, examId, conceptId);

        const res = await getWrongQuestionList(`?tagIds=${tagId}`);
        const body = (await res.json()) as { data: WrongQuestionDto[]; paginate: { total: number } };
        expect(body.paginate.total).toBe(1);
        expect(body.data[0].question.id).toBe(q1.id);
      });
    });
  });

  describe('PUT /:id/note', () => {
    it('rejects with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdTokenUid).mockResolvedValue(null);
      const res = await putWrongQuestionNote(1, 'x');
      expect(res.status).toBe(401);
    });

    it('sets a note on the entry', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      await seedWrongQuestion(subjectId, examId, conceptId);
      const listRes = await getWrongQuestionList();
      const { data } = (await listRes.json()) as { data: WrongQuestionDto[] };
      const entryId = data[0].id;

      const res = await putWrongQuestionNote(entryId, '記得再複習一次');
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ id: entryId, note: '記得再複習一次' });

      const after = await getWrongQuestionList();
      const afterBody = (await after.json()) as { data: WrongQuestionDto[] };
      expect(afterBody.data[0].note).toBe('記得再複習一次');
    });

    it('clears an existing note when note is null', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      await seedWrongQuestion(subjectId, examId, conceptId);
      const listRes = await getWrongQuestionList();
      const { data } = (await listRes.json()) as { data: WrongQuestionDto[] };
      const entryId = data[0].id;
      await putWrongQuestionNote(entryId, 'first note');

      const res = await putWrongQuestionNote(entryId, null);
      expect((await res.json()).note).toBeNull();
    });

    it("rejects updating another user's entry with 404", async () => {
      await seedUser('fixture-uid');
      await seedUser('other-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const q = await seedWrongQuestion(subjectId, examId, conceptId);

      const db = getDb();
      const [row] = await db.select().from(userWrongQuestionTable).where(eq(userWrongQuestionTable.questionId, q.id));

      vi.mocked(verifyIdTokenUid).mockResolvedValue('other-uid');
      const res = await putWrongQuestionNote(row.id, 'not mine');
      expect(res.status).toBe(404);
    });

    it('returns 404 for a non-existent id', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const res = await putWrongQuestionNote(999999, 'x');
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /:id', () => {
    it('rejects with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdTokenUid).mockResolvedValue(null);
      const res = await deleteWrongQuestion(1);
      expect(res.status).toBe(401);
    });

    it('deletes the entry', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      await seedWrongQuestion(subjectId, examId, conceptId);
      const listRes = await getWrongQuestionList();
      const { data } = (await listRes.json()) as { data: WrongQuestionDto[] };
      const entryId = data[0].id;

      const res = await deleteWrongQuestion(entryId);
      expect(res.status).toBe(204);

      const after = await getWrongQuestionList();
      const afterBody = (await after.json()) as { data: WrongQuestionDto[] };
      expect(afterBody.data).toEqual([]);
    });

    it("rejects deleting another user's entry with 404, leaving it intact", async () => {
      await seedUser('fixture-uid');
      await seedUser('other-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const q = await seedWrongQuestion(subjectId, examId, conceptId);

      const db = getDb();
      const [row] = await db.select().from(userWrongQuestionTable).where(eq(userWrongQuestionTable.questionId, q.id));

      vi.mocked(verifyIdTokenUid).mockResolvedValue('other-uid');
      const res = await deleteWrongQuestion(row.id);
      expect(res.status).toBe(404);

      const stillThere = await db.select().from(userWrongQuestionTable).where(eq(userWrongQuestionTable.id, row.id));
      expect(stillThere).toHaveLength(1);
    });

    it('returns 404 for a non-existent id', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const res = await deleteWrongQuestion(999999);
      expect(res.status).toBe(404);
    });
  });
});
