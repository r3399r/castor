import { eq } from 'drizzle-orm';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
import {
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
  subjectTable,
  tagTable,
  userConceptStatTable,
  userTable,
} from 'src/db/schema';
import { ADMIN_EMAILS } from 'src/middleware/adminAuth';

// The admin gate is exercised end-to-end in its own describe block below;
// every other test just needs writes to succeed, so default the mocked
// Firebase verification to the admin identity. verifyIdTokenUid backs
// GET /adaptive's separate app-user resolution (requireUser) -- unmocked
// calls resolve to undefined, which requireUser treats the same as "no
// identity" (401), so tests that never touch /adaptive don't need to
// configure it.
vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdToken: vi.fn(), verifyIdTokenUid: vi.fn() }));
import { verifyIdToken, verifyIdTokenUid } from 'src/lib/firebaseAdmin';

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
  adjustedDifficulty: number;
};

const postQuestions = (body: unknown) =>
  app.request('/api/question', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const getQuestionList = (query = '') => app.request(`/api/question${query}`);

const getQuestionCount = (query: string) => app.request(`/api/question/count${query}`);

const getAdaptive = (query: string) => app.request(`/api/question/adaptive${query}`);

const getQuestion = (id: number | string) => app.request(`/api/question/${id}`);

const putQuestion = (id: number | string, body: unknown) =>
  app.request(`/api/question/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const deleteQuestion = (id: number | string) =>
  app.request(`/api/question/${id}`, { method: 'DELETE' });

const getQuestionTag = (id: number | string) => app.request(`/api/question/${id}/tag`);

const putQuestionTag = (id: number | string, body: unknown) =>
  app.request(`/api/question/${id}/tag`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const getQuestionConcept = (id: number | string) =>
  app.request(`/api/question/${id}/concept`);

const putQuestionConcept = (id: number | string, body: unknown) =>
  app.request(`/api/question/${id}/concept`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// Creates one question in its own batch call and returns its flat row --
// convenient for GET/PUT/DELETE tests that just need an existing question,
// not the batch machinery itself.
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
  return body[0][0];
};

const clearTables = async () => {
  const db = getDb();
  await db.delete(questionTagTable);
  await db.delete(questionConceptTable);
  await db.delete(questionExamTable);
  // pending_reply/reply/user_concept_stat all reference question and/or
  // user -- clear them before question/user go, same FK-ordering concern
  // as the join tables above.
  await db.delete(pendingReplyTable);
  await db.delete(replyTable);
  await db.delete(userConceptStatTable);
  // question.parentId is self-referential -- a bulk DELETE can hit a
  // parent row before a still-live child row that points to it, tripping
  // the FK. Null out every self-reference first so the delete has nothing
  // left to violate.
  await db.update(questionTable).set({ parentId: null });
  await db.delete(questionTable);
  await db.delete(conceptTable);
  await db.delete(conceptGroupTable);
  await db.delete(tagTable);
  await db.delete(examSubjectTable);
  await db.delete(examTable);
  await db.delete(subjectTable);
  await db.delete(userTable);
};

// Seeds a subject with one exam (linked via exam_subject), one tag, and
// one concept (via one concept_group) -- everything a valid question
// create needs, all scoped to the same subject.
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

// Adaptive selection resolves the caller via requireUser (firebase_uid ->
// user row), separate from the admin-allowlist gate the other tests use
// -- this seeds that row and returns its id for tests that need to
// insert reply/user_concept_stat fixtures directly.
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

describe('question routes', () => {
  beforeAll(clearTables);

  beforeEach(() => {
    vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);
  });

  afterEach(clearTables);

  afterAll(async () => {
    await closeDb();
  });

  it('creates a SINGLE question and links exam/concept', async () => {
    const { subjectId, examId, conceptId } = await seedFixture();

    const res = await postQuestions({
      subjectId,
      examId,
      questions: [
        {
          type: 'SINGLE',
          content: 'what is 1+1?',
          options: 'A|B|C|D',
          answer: 'B',
          difficulty: 3,
          conceptIds: [conceptId],
        },
      ],
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as QuestionDto[][];
    expect(body).toHaveLength(1);
    expect(body[0]).toHaveLength(1);
    expect(body[0][0]).toMatchObject({
      subjectId,
      parentId: null,
      isGroup: false,
      type: 'SINGLE',
      content: 'what is 1+1?',
      answer: 'B',
      difficulty: 3,
      adjustedDifficulty: 3,
    });
    expect(body[0][0].uuid).toEqual(expect.any(String));

    const db = getDb();
    const [examLink] = await db
      .select()
      .from(questionExamTable)
      .where(eq(questionExamTable.questionId, body[0][0].id));
    expect(examLink).toMatchObject({ questionId: body[0][0].id, examId });

    const [conceptLink] = await db
      .select()
      .from(questionConceptTable)
      .where(eq(questionConceptTable.questionId, body[0][0].id));
    expect(conceptLink).toMatchObject({ questionId: body[0][0].id, conceptId });

    const [concept] = await db
      .select()
      .from(conceptTable)
      .where(eq(conceptTable.id, conceptId));
    expect(concept.numberOfQuestions).toBe(1);
  });

  it('creates multiple questions in a single batch request', async () => {
    const { subjectId, examId, conceptId } = await seedFixture();

    const res = await postQuestions({
      subjectId,
      examId,
      questions: [
        { type: 'SINGLE', content: 'q1', options: 'A|B', answer: 'A', difficulty: 3, conceptIds: [conceptId] },
        { type: 'SINGLE', content: 'q2', options: 'A|B', answer: 'B', difficulty: 4, conceptIds: [conceptId] },
        { type: 'SINGLE', content: 'q3', options: 'A|B', answer: 'A', difficulty: 5, conceptIds: [conceptId] },
      ],
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as QuestionDto[][];
    expect(body).toHaveLength(3);
    expect(body.map((rows) => rows[0].content)).toEqual(['q1', 'q2', 'q3']);

    const db = getDb();
    const [concept] = await db
      .select()
      .from(conceptTable)
      .where(eq(conceptTable.id, conceptId));
    expect(concept.numberOfQuestions).toBe(3);
  });

  it('rolls back the whole batch if any question in it is invalid', async () => {
    const { subjectId, examId, conceptId } = await seedFixture();

    const res = await postQuestions({
      subjectId,
      examId,
      questions: [
        { type: 'SINGLE', content: 'q1', options: 'A|B', answer: 'A', difficulty: 3, conceptIds: [conceptId] },
        { type: 'SINGLE', content: 'q2', options: 'A|B', answer: 'B', difficulty: 4, conceptIds: [] },
      ],
    });
    expect(res.status).toBe(400);

    const db = getDb();
    const remaining = await db.select().from(questionTable);
    expect(remaining).toHaveLength(0);
    const [concept] = await db
      .select()
      .from(conceptTable)
      .where(eq(conceptTable.id, conceptId));
    expect(concept.numberOfQuestions).toBe(0);
  });

  it('links tags when tagIds is provided', async () => {
    const { subjectId, examId, tagId, conceptId } = await seedFixture();

    const res = await postQuestions({
      subjectId,
      examId,
      questions: [
        { type: 'SINGLE', difficulty: 3, tagIds: [tagId], conceptIds: [conceptId] },
      ],
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as QuestionDto[][];
    const questionId = body[0][0].id;

    const db = getDb();
    const [tagLink] = await db
      .select()
      .from(questionTagTable)
      .where(eq(questionTagTable.questionId, questionId));
    expect(tagLink).toMatchObject({ questionId, tagId });
  });

  it('creates a GROUP question with childQuestions, each keeping its own difficulty', async () => {
    const { subjectId, examId, conceptId } = await seedFixture();

    const res = await postQuestions({
      subjectId,
      examId,
      questions: [
        {
          type: 'GROUP',
          difficulty: 5,
          conceptIds: [conceptId],
          childQuestions: [
            {
              type: 'SINGLE',
              sortOrder: 0,
              content: 'child 1',
              options: 'A|B',
              answer: 'A',
              difficulty: 2,
            },
            {
              type: 'SINGLE',
              sortOrder: 1,
              content: 'child 2',
              options: 'A|B',
              answer: 'B',
              difficulty: 8,
            },
          ],
        },
      ],
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as QuestionDto[][];
    expect(body).toHaveLength(1);
    expect(body[0]).toHaveLength(3);

    const [parent, child1, child2] = body[0];
    expect(parent).toMatchObject({ isGroup: true, type: 'GROUP', parentId: null });
    expect(child1).toMatchObject({
      parentId: parent.id,
      isGroup: false,
      content: 'child 1',
      difficulty: 2,
      adjustedDifficulty: 2,
    });
    expect(child2).toMatchObject({
      parentId: parent.id,
      content: 'child 2',
      difficulty: 8,
      adjustedDifficulty: 8,
    });
  });

  it('rejects an empty conceptIds with 400', async () => {
    const { subjectId, examId } = await seedFixture();

    const res = await postQuestions({
      subjectId,
      examId,
      questions: [{ type: 'SINGLE', difficulty: 3, conceptIds: [] }],
    });
    expect(res.status).toBe(400);
  });

  it('rejects an empty questions array with 400', async () => {
    const { subjectId, examId } = await seedFixture();

    const res = await postQuestions({ subjectId, examId, questions: [] });
    expect(res.status).toBe(400);
  });

  it('404s for an unknown subjectId', async () => {
    const { examId, conceptId } = await seedFixture();

    const res = await postQuestions({
      subjectId: 999999,
      examId,
      questions: [{ type: 'SINGLE', difficulty: 3, conceptIds: [conceptId] }],
    });
    expect(res.status).toBe(404);
  });

  it('404s for an unknown examId', async () => {
    const { subjectId, conceptId } = await seedFixture();

    const res = await postQuestions({
      subjectId,
      examId: 999999,
      questions: [{ type: 'SINGLE', difficulty: 3, conceptIds: [conceptId] }],
    });
    expect(res.status).toBe(404);
  });

  it('rejects an exam that does not belong to the subject with 400', async () => {
    const { subjectId, conceptId } = await seedFixture();
    const db = getDb();
    const [{ insertId: otherSubjectId }] = await db
      .insert(subjectTable)
      .values({ name: 'other subject', createdAt: new Date() });
    const [{ insertId: unlinkedExamId }] = await db
      .insert(examTable)
      .values({ name: 'unlinked exam', createdAt: new Date() });
    await db
      .insert(examSubjectTable)
      .values({ examId: unlinkedExamId, subjectId: otherSubjectId });

    const res = await postQuestions({
      subjectId,
      examId: unlinkedExamId,
      questions: [{ type: 'SINGLE', difficulty: 3, conceptIds: [conceptId] }],
    });
    expect(res.status).toBe(400);
  });

  it('rejects a tag that does not belong to the subject with 400', async () => {
    const { subjectId, examId, conceptId } = await seedFixture();
    const db = getDb();
    const [{ insertId: otherSubjectId }] = await db
      .insert(subjectTable)
      .values({ name: 'other subject 2', createdAt: new Date() });
    const [{ insertId: unrelatedTagId }] = await db
      .insert(tagTable)
      .values({ name: 'unrelated tag', subjectId: otherSubjectId, createdAt: new Date() });

    const res = await postQuestions({
      subjectId,
      examId,
      questions: [
        { type: 'SINGLE', difficulty: 3, tagIds: [unrelatedTagId], conceptIds: [conceptId] },
      ],
    });
    expect(res.status).toBe(400);
  });

  it('rejects a concept that does not belong to the subject with 400', async () => {
    const { subjectId, examId } = await seedFixture();
    const db = getDb();
    const [{ insertId: otherSubjectId }] = await db
      .insert(subjectTable)
      .values({ name: 'other subject 3', createdAt: new Date() });
    const [{ insertId: otherGroupId }] = await db
      .insert(conceptGroupTable)
      .values({ name: 'other group', subjectId: otherSubjectId, createdAt: new Date() });
    const [{ insertId: unrelatedConceptId }] = await db
      .insert(conceptTable)
      .values({ name: 'unrelated concept', conceptGroupId: otherGroupId, createdAt: new Date() });

    const res = await postQuestions({
      subjectId,
      examId,
      questions: [{ type: 'SINGLE', difficulty: 3, conceptIds: [unrelatedConceptId] }],
    });
    expect(res.status).toBe(400);
  });

  it('rejects a difficulty outside 1-10 with 400', async () => {
    const { subjectId, examId, conceptId } = await seedFixture();

    const res = await postQuestions({
      subjectId,
      examId,
      questions: [{ type: 'SINGLE', difficulty: 0, conceptIds: [conceptId] }],
    });
    expect(res.status).toBe(400);
  });

  describe('GET /', () => {
    it('lists only top-level questions, with a childCount for GROUP questions', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      const single = await createQuestion(subjectId, examId, { conceptIds: [conceptId] });
      const groupRes = await postQuestions({
        subjectId,
        examId,
        questions: [
          {
            type: 'GROUP',
            difficulty: 5,
            conceptIds: [conceptId],
            childQuestions: [
              { type: 'SINGLE', sortOrder: 0, content: 'c1', options: 'A|B', answer: 'A', difficulty: 3 },
              { type: 'SINGLE', sortOrder: 1, content: 'c2', options: 'A|B', answer: 'B', difficulty: 3 },
            ],
          },
        ],
      });
      const [[group]] = (await groupRes.json()) as QuestionDto[][];

      const res = await getQuestionList();
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: (QuestionDto & { subject: string; childCount: number })[];
        paginate: { total: number };
      };
      expect(body.paginate.total).toBe(2);
      const ids = body.data.map((q) => q.id);
      expect(ids).toContain(single.id);
      expect(ids).toContain(group.id);
      const groupRow = body.data.find((q) => q.id === group.id)!;
      expect(groupRow.childCount).toBe(2);
      expect(groupRow.subject).toBe('fixture subject');
      const singleRow = body.data.find((q) => q.id === single.id)!;
      expect(singleRow.childCount).toBe(0);
    });

    it('sorts by difficulty ascending and descending', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      const low = await createQuestion(subjectId, examId, { difficulty: 2, conceptIds: [conceptId] });
      const high = await createQuestion(subjectId, examId, { difficulty: 9, conceptIds: [conceptId] });

      const ascRes = await getQuestionList('?sort=difficulty&order=asc');
      const ascBody = (await ascRes.json()) as { data: QuestionDto[] };
      expect(ascBody.data.map((q) => q.id)).toEqual([low.id, high.id]);

      const descRes = await getQuestionList('?sort=difficulty&order=desc');
      const descBody = (await descRes.json()) as { data: QuestionDto[] };
      expect(descBody.data.map((q) => q.id)).toEqual([high.id, low.id]);
    });

    it('rejects an invalid sort column with 400', async () => {
      const res = await getQuestionList('?sort=bogus');
      expect(res.status).toBe(400);
    });

    it('leaves GET ungated even with no valid identity', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);
      const res = await getQuestionList();
      expect(res.status).toBe(200);
    });
  });

  describe('GET /count', () => {
    it('counts only top-level questions for the given subject', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      await createQuestion(subjectId, examId, { conceptIds: [conceptId] });
      await createQuestion(subjectId, examId, { conceptIds: [conceptId] });
      const db = getDb();
      const [{ insertId: otherSubjectId }] = await db
        .insert(subjectTable)
        .values({ name: 'other subject count', createdAt: new Date() });
      const [{ insertId: otherExamId }] = await db
        .insert(examTable)
        .values({ name: 'other exam count', createdAt: new Date() });
      await db.insert(examSubjectTable).values({ examId: otherExamId, subjectId: otherSubjectId });
      const [{ insertId: otherGroupId }] = await db
        .insert(conceptGroupTable)
        .values({ name: 'other group count', subjectId: otherSubjectId, createdAt: new Date() });
      const [{ insertId: otherConceptId }] = await db
        .insert(conceptTable)
        .values({ name: 'other concept count', conceptGroupId: otherGroupId, createdAt: new Date() });
      await createQuestion(otherSubjectId, otherExamId, { conceptIds: [otherConceptId] });

      const res = await getQuestionCount(`?subjectId=${subjectId}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ total: 2 });
    });

    it('excludes GROUP question children from the count', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      await postQuestions({
        subjectId,
        examId,
        questions: [
          {
            type: 'GROUP',
            difficulty: 5,
            conceptIds: [conceptId],
            childQuestions: [
              { type: 'SINGLE', sortOrder: 0, content: 'c1', options: 'A|B', answer: 'A', difficulty: 3 },
            ],
          },
        ],
      });

      const res = await getQuestionCount(`?subjectId=${subjectId}`);
      expect(await res.json()).toEqual({ total: 1 });
    });

    it('filters by examIds', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      const db = getDb();
      const [{ insertId: examId2 }] = await db
        .insert(examTable)
        .values({ name: 'second exam', createdAt: new Date() });
      await db.insert(examSubjectTable).values({ examId: examId2, subjectId });
      await createQuestion(subjectId, examId, { conceptIds: [conceptId] });
      await createQuestion(subjectId, examId2, { conceptIds: [conceptId] });

      const res = await getQuestionCount(`?subjectId=${subjectId}&examIds=${examId2}`);
      expect(await res.json()).toEqual({ total: 1 });
    });

    it('filters by conceptIds', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      const db = getDb();
      const [{ insertId: groupId2 }] = await db
        .insert(conceptGroupTable)
        .values({ name: 'second group', subjectId, createdAt: new Date() });
      const [{ insertId: conceptId2 }] = await db
        .insert(conceptTable)
        .values({ name: 'second concept', conceptGroupId: groupId2, createdAt: new Date() });
      await createQuestion(subjectId, examId, { conceptIds: [conceptId] });
      await createQuestion(subjectId, examId, { conceptIds: [conceptId2] });

      const res = await getQuestionCount(`?subjectId=${subjectId}&conceptIds=${conceptId2}`);
      expect(await res.json()).toEqual({ total: 1 });
    });

    it('filters by tagIds', async () => {
      const { subjectId, examId, tagId, conceptId } = await seedFixture();
      const db = getDb();
      const [{ insertId: tagId2 }] = await db
        .insert(tagTable)
        .values({ name: 'second tag', subjectId, createdAt: new Date() });
      await createQuestion(subjectId, examId, { tagIds: [tagId], conceptIds: [conceptId] });
      await createQuestion(subjectId, examId, { tagIds: [tagId2], conceptIds: [conceptId] });

      const res = await getQuestionCount(`?subjectId=${subjectId}&tagIds=${tagId2}`);
      expect(await res.json()).toEqual({ total: 1 });
    });

    it('combines filters with AND semantics', async () => {
      const { subjectId, examId, tagId, conceptId } = await seedFixture();
      const db = getDb();
      const [{ insertId: tagId2 }] = await db
        .insert(tagTable)
        .values({ name: 'second tag 2', subjectId, createdAt: new Date() });
      await createQuestion(subjectId, examId, { tagIds: [tagId], conceptIds: [conceptId] });
      await createQuestion(subjectId, examId, { tagIds: [tagId2], conceptIds: [conceptId] });

      const res = await getQuestionCount(
        `?subjectId=${subjectId}&examIds=${examId}&tagIds=${tagId}&conceptIds=${conceptId}`
      );
      expect(await res.json()).toEqual({ total: 1 });
    });

    it('returns 0 when no question matches the filters', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      await createQuestion(subjectId, examId, { conceptIds: [conceptId] });

      const res = await getQuestionCount(`?subjectId=${subjectId}&tagIds=999999`);
      expect(await res.json()).toEqual({ total: 0 });
    });

    it('rejects a missing subjectId with 400', async () => {
      const res = await getQuestionCount('');
      expect(res.status).toBe(400);
    });

    it('leaves GET ungated even with no valid identity', async () => {
      const { subjectId } = await seedFixture();
      vi.mocked(verifyIdToken).mockResolvedValue(null);
      const res = await getQuestionCount(`?subjectId=${subjectId}`);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /adaptive', () => {
    type AdaptiveDto = QuestionDto & {
      exam: { id: number; name: string }[];
      tag: { id: number; name: string }[];
      concept: { id: number; name: string; conceptGroup: { id: number; name: string } }[];
    };

    it('rejects with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdTokenUid).mockResolvedValue(null);
      const { subjectId } = await seedFixture();

      const res = await getAdaptive(`?subjectId=${subjectId}`);
      expect(res.status).toBe(401);
    });

    it('rejects with 401 when the token resolves to an unknown user', async () => {
      vi.mocked(verifyIdTokenUid).mockResolvedValue('unknown-uid');
      const { subjectId } = await seedFixture();

      const res = await getAdaptive(`?subjectId=${subjectId}`);
      expect(res.status).toBe(401);
    });

    it('rejects a conceptId that does not belong to the subject with 400', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      await createQuestion(subjectId, examId, { conceptIds: [conceptId] });
      const db = getDb();
      const [{ insertId: otherSubjectId }] = await db
        .insert(subjectTable)
        .values({ name: 'other adaptive subject', createdAt: new Date() });
      const [{ insertId: otherGroupId }] = await db
        .insert(conceptGroupTable)
        .values({ name: 'other adaptive group', subjectId: otherSubjectId, createdAt: new Date() });
      const [{ insertId: otherConceptId }] = await db
        .insert(conceptTable)
        .values({ name: 'other adaptive concept', conceptGroupId: otherGroupId, createdAt: new Date() });

      const res = await getAdaptive(`?subjectId=${subjectId}&conceptIds=${otherConceptId}`);
      expect(res.status).toBe(400);
    });

    it('returns a question bundled with its exam/tag/concept', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, tagId, conceptId } = await seedFixture();
      const created = await createQuestion(subjectId, examId, {
        tagIds: [tagId],
        conceptIds: [conceptId],
      });

      const res = await getAdaptive(`?subjectId=${subjectId}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as AdaptiveDto[];
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(created.id);
      expect(body[0].exam).toEqual([{ id: examId, name: 'fixture exam' }]);
      expect(body[0].tag).toEqual([{ id: tagId, name: 'fixture tag' }]);
      expect(body[0].concept).toEqual([
        { id: conceptId, name: 'fixture concept', conceptGroup: { id: expect.any(Number), name: 'fixture group' } },
      ]);
    });

    it('serves the same pending question again on a second fetch, rather than re-randomizing', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      await createQuestion(subjectId, examId, { conceptIds: [conceptId] });

      const first = (await (await getAdaptive(`?subjectId=${subjectId}`)).json()) as AdaptiveDto[];
      const second = (await (await getAdaptive(`?subjectId=${subjectId}`)).json()) as AdaptiveDto[];
      expect(second.map((q) => q.id)).toEqual(first.map((q) => q.id));
    });

    it('returns fewer than requested when there are not enough candidates, without erroring', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      await createQuestion(subjectId, examId, { conceptIds: [conceptId] });

      const res = await getAdaptive(`?subjectId=${subjectId}&count=5`);
      expect(res.status).toBe(200);
      expect((await res.json()) as AdaptiveDto[]).toHaveLength(1);
    });

    it('filters by examIds', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const db = getDb();
      const [{ insertId: examId2 }] = await db
        .insert(examTable)
        .values({ name: 'second exam', createdAt: new Date() });
      await db.insert(examSubjectTable).values({ examId: examId2, subjectId });
      const wanted = await createQuestion(subjectId, examId2, { conceptIds: [conceptId] });
      await createQuestion(subjectId, examId, { conceptIds: [conceptId] });

      const res = await getAdaptive(`?subjectId=${subjectId}&examIds=${examId2}&count=5`);
      const body = (await res.json()) as AdaptiveDto[];
      expect(body.map((q) => q.id)).toEqual([wanted.id]);
    });

    it('prefers a fresh question over one replied to in the last 7 days when both are candidates', async () => {
      const userId = await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const recentlyReplied = await createQuestion(subjectId, examId, { conceptIds: [conceptId] });
      const fresh = await createQuestion(subjectId, examId, { conceptIds: [conceptId] });
      const db = getDb();
      await db.insert(replyTable).values({
        questionId: recentlyReplied.id,
        subjectId,
        userId,
        parentId: null,
        score: 1,
        repliedAnswer: 'A',
        repliedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await getAdaptive(`?subjectId=${subjectId}&count=1`);
      const body = (await res.json()) as AdaptiveDto[];
      expect(body.map((q) => q.id)).toEqual([fresh.id]);
    });

    it('falls back to a recently-replied question when it is the only candidate', async () => {
      const userId = await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const onlyQuestion = await createQuestion(subjectId, examId, { conceptIds: [conceptId] });
      const db = getDb();
      await db.insert(replyTable).values({
        questionId: onlyQuestion.id,
        subjectId,
        userId,
        parentId: null,
        score: 1,
        repliedAnswer: 'A',
        repliedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await getAdaptive(`?subjectId=${subjectId}&count=1`);
      const body = (await res.json()) as AdaptiveDto[];
      expect(body.map((q) => q.id)).toEqual([onlyQuestion.id]);
    });
  });

  describe('GET /:id', () => {
    it('fetches a question bundled with its examId/tagIds/conceptIds', async () => {
      const { subjectId, examId, tagId, conceptId } = await seedFixture();
      const created = await createQuestion(subjectId, examId, {
        tagIds: [tagId],
        conceptIds: [conceptId],
      });

      const res = await getQuestion(created.id);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        id: created.id,
        examId,
        tagIds: [tagId],
        conceptIds: [conceptId],
      });
    });

    it('404s for an unknown question id', async () => {
      const res = await getQuestion(999999);
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({
        status: 404,
        name: 'NotFoundError',
        code: 'NOT_FOUND',
      });
    });
  });

  describe('PUT /:id', () => {
    it('updates scalar fields and replaces the exam link', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      const created = await createQuestion(subjectId, examId, { conceptIds: [conceptId] });
      const db = getDb();
      const [{ insertId: otherExamId }] = await db
        .insert(examTable)
        .values({ name: 'other exam', createdAt: new Date() });
      await db.insert(examSubjectTable).values({ examId: otherExamId, subjectId });

      const res = await putQuestion(created.id, {
        type: 'SINGLE',
        content: 'updated content',
        options: 'A|B|C',
        answer: 'C',
        difficulty: 7,
        examId: otherExamId,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        content: 'updated content',
        answer: 'C',
        difficulty: 7,
      });

      const getRes = await getQuestion(created.id);
      expect(await getRes.json()).toMatchObject({ examId: otherExamId });
    });

    it('404s for an unknown question id', async () => {
      const { examId } = await seedFixture();
      const res = await putQuestion(999999, {
        type: 'SINGLE',
        difficulty: 5,
        examId,
      });
      expect(res.status).toBe(404);
    });

    it('rejects an exam that does not belong to the subject with 400', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      const created = await createQuestion(subjectId, examId, { conceptIds: [conceptId] });
      const db = getDb();
      const [{ insertId: otherSubjectId }] = await db
        .insert(subjectTable)
        .values({ name: 'unrelated subject', createdAt: new Date() });
      const [{ insertId: unlinkedExamId }] = await db
        .insert(examTable)
        .values({ name: 'unlinked exam', createdAt: new Date() });
      await db
        .insert(examSubjectTable)
        .values({ examId: unlinkedExamId, subjectId: otherSubjectId });

      const res = await putQuestion(created.id, {
        type: 'SINGLE',
        difficulty: 5,
        examId: unlinkedExamId,
      });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /:id', () => {
    it('deletes a question and decrements its concepts numberOfQuestions', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      const created = await createQuestion(subjectId, examId, { conceptIds: [conceptId] });

      const res = await deleteQuestion(created.id);
      expect(res.status).toBe(204);

      const getRes = await getQuestion(created.id);
      expect(getRes.status).toBe(404);

      const db = getDb();
      const [concept] = await db.select().from(conceptTable).where(eq(conceptTable.id, conceptId));
      expect(concept.numberOfQuestions).toBe(0);
    });

    it('cascades to a GROUP question’s children', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      const res = await postQuestions({
        subjectId,
        examId,
        questions: [
          {
            type: 'GROUP',
            difficulty: 5,
            conceptIds: [conceptId],
            childQuestions: [
              { type: 'SINGLE', sortOrder: 0, content: 'c1', options: 'A|B', answer: 'A', difficulty: 3 },
            ],
          },
        ],
      });
      const [[group, child]] = (await res.json()) as QuestionDto[][];

      const deleteRes = await deleteQuestion(group.id);
      expect(deleteRes.status).toBe(204);

      expect((await getQuestion(child.id)).status).toBe(404);
    });

    it('404s for an unknown question id', async () => {
      const res = await deleteQuestion(999999);
      expect(res.status).toBe(404);
    });
  });

  describe('/:id/tag', () => {
    it('sets, replaces, and clears tag links', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      const db = getDb();
      const [{ insertId: tag1 }] = await db
        .insert(tagTable)
        .values({ name: 'tag one', subjectId, createdAt: new Date() });
      const [{ insertId: tag2 }] = await db
        .insert(tagTable)
        .values({ name: 'tag two', subjectId, createdAt: new Date() });
      const created = await createQuestion(subjectId, examId, { conceptIds: [conceptId] });

      const setRes = await putQuestionTag(created.id, { tagIds: [tag1, tag2] });
      expect(setRes.status).toBe(200);
      const setBody = (await setRes.json()) as { tagIds: number[] };
      expect(setBody.tagIds.sort()).toEqual([tag1, tag2].sort());

      const getRes = await getQuestionTag(created.id);
      expect(((await getRes.json()) as { tagIds: number[] }).tagIds.sort()).toEqual(
        [tag1, tag2].sort()
      );

      const clearRes = await putQuestionTag(created.id, { tagIds: [] });
      expect(await clearRes.json()).toEqual({ tagIds: [] });
    });

    it('rejects a tag that does not belong to the subject with 400', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      const created = await createQuestion(subjectId, examId, { conceptIds: [conceptId] });
      const db = getDb();
      const [{ insertId: otherSubjectId }] = await db
        .insert(subjectTable)
        .values({ name: 'unrelated subject 2', createdAt: new Date() });
      const [{ insertId: unrelatedTagId }] = await db
        .insert(tagTable)
        .values({ name: 'unrelated tag', subjectId: otherSubjectId, createdAt: new Date() });

      const res = await putQuestionTag(created.id, { tagIds: [unrelatedTagId] });
      expect(res.status).toBe(400);
    });

    it('404s for an unknown question id', async () => {
      expect((await getQuestionTag(999999)).status).toBe(404);
      expect((await putQuestionTag(999999, { tagIds: [] })).status).toBe(404);
    });
  });

  describe('/:id/concept', () => {
    it('adjusts numberOfQuestions for added and removed concepts', async () => {
      const { subjectId, examId, conceptId: conceptA } = await seedFixture();
      const db = getDb();
      const [{ insertId: groupB }] = await db
        .insert(conceptGroupTable)
        .values({ name: 'fixture group b', subjectId, createdAt: new Date() });
      const [{ insertId: conceptB }] = await db
        .insert(conceptTable)
        .values({ name: 'fixture concept b', conceptGroupId: groupB, createdAt: new Date() });
      const created = await createQuestion(subjectId, examId, { conceptIds: [conceptA] });

      const res = await putQuestionConcept(created.id, { conceptIds: [conceptB] });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ conceptIds: [conceptB] });

      const [rowA] = await db.select().from(conceptTable).where(eq(conceptTable.id, conceptA));
      const [rowB] = await db.select().from(conceptTable).where(eq(conceptTable.id, conceptB));
      expect(rowA.numberOfQuestions).toBe(0);
      expect(rowB.numberOfQuestions).toBe(1);
    });

    it('rejects an empty conceptIds with 400', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      const created = await createQuestion(subjectId, examId, { conceptIds: [conceptId] });

      const res = await putQuestionConcept(created.id, { conceptIds: [] });
      expect(res.status).toBe(400);
    });

    it('rejects a concept that does not belong to the subject with 400', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      const created = await createQuestion(subjectId, examId, { conceptIds: [conceptId] });
      const db = getDb();
      const [{ insertId: otherSubjectId }] = await db
        .insert(subjectTable)
        .values({ name: 'unrelated subject 3', createdAt: new Date() });
      const [{ insertId: otherGroupId }] = await db
        .insert(conceptGroupTable)
        .values({ name: 'other group', subjectId: otherSubjectId, createdAt: new Date() });
      const [{ insertId: unrelatedConceptId }] = await db
        .insert(conceptTable)
        .values({ name: 'unrelated concept', conceptGroupId: otherGroupId, createdAt: new Date() });

      const res = await putQuestionConcept(created.id, { conceptIds: [unrelatedConceptId] });
      expect(res.status).toBe(400);
    });

    it('404s for an unknown question id', async () => {
      expect((await getQuestionConcept(999999)).status).toBe(404);
      expect((await putQuestionConcept(999999, { conceptIds: [1] })).status).toBe(404);
    });
  });

  describe('admin auth gate', () => {
    it('rejects a create with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await postQuestions({});
      expect(res.status).toBe(401);
    });

    it('rejects a create with 403 for a non-admin email', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue('someone-else@example.com');

      const res = await postQuestions({});
      expect(res.status).toBe(403);
    });

    it('rejects an update with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await putQuestion(1, {});
      expect(res.status).toBe(401);
    });

    it('rejects a delete with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await deleteQuestion(1);
      expect(res.status).toBe(401);
    });
  });
});
