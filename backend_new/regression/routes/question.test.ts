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

// POST /question fires-and-forgets a call to arm the Facebook auto-post
// EventBridge rule -- mocked so these tests don't make a real (if
// harmless, since the rule name never matches a real deployed one
// locally) network call to AWS on every question creation.
vi.mock('src/lib/facebookEventBridge', () => ({ enableFacebookEventBridge: vi.fn() }));

// POST /question/image's only external dependency -- mocked so the suite
// exercises the concept resolution, output validation and id filtering
// around the model call without spending a real Gemini request (or
// needing an API key) on every run.
vi.mock('src/lib/genai', () => ({ generateJsonFromImages: vi.fn() }));
import { generateJsonFromImages } from 'src/lib/genai';

// POST /question/image/figure's only external dependency. Mocked so the
// suite covers the mime allowlist, the key shape and the auth gate
// without needing S3 credentials or a bucket.
vi.mock('src/lib/s3', () => ({ uploadToS3: vi.fn(), deleteFromS3: vi.fn() }));
import { uploadToS3 } from 'src/lib/s3';
import { BadGatewayError, TooManyRequestsError } from 'src/model/error';

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

import {
  getQuestionAdaptiveResponseSchema,
  getQuestionByIdResponseSchema,
  getQuestionCountResponseSchema,
  getQuestionListResponseSchema,
  postQuestionResponseSchema,
  putQuestionEnabledResponseSchema,
  questionConceptResponseSchema,
  questionRowSchema,
  questionTagResponseSchema,
} from 'src/routes/question';

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

// 1x1 transparent PNG -- the route never decodes it (that's the model's
// job), it just has to survive base64 validation.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGMAAQAABQAB';

const postQuestionImage = (body: unknown) =>
  app.request('/api/question/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const postQuestionFigure = (body: unknown) =>
  app.request('/api/question/image/figure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const getQuestionImagePrompt = (query: string) =>
  app.request(`/api/question/image/prompt${query}`);

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
const putQuestionEnabled = (id: number | string, body: unknown) =>
  app.request(`/api/question/${id}/enabled`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// Questions are created enabled, which is what almost every test below
// wants. Pass enabled: false to get a hidden one -- that now takes an
// explicit flip, where it used to be the as-created state.
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
    enabled: boolean;
  }> & { conceptIds: number[] }
) => {
  const { enabled = true, ...questionOverrides } = overrides;
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
        ...questionOverrides,
      },
    ],
  });
  const body = (await res.json()) as QuestionDto[][];
  const question = body[0][0];
  if (!enabled) await putQuestionEnabled(question.id, { enabled: false });
  return question;
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
  await db.delete(subjectCategoryTable);
  await db.delete(subjectTable);
  await db.delete(categoryTable);
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

    it("reports the subject's categories, and an empty list when it has none", async () => {
      const db = getDb();
      const { subjectId, examId, conceptId } = await seedFixture();
      // Listed out of alphabetical order on purpose: the response is
      // sorted by name, not by link or insertion order.
      const [{ insertId: humanities }] = await db
        .insert(categoryTable)
        .values({ name: '社會', createdAt: new Date() });
      const [{ insertId: science }] = await db
        .insert(categoryTable)
        .values({ name: '自然', createdAt: new Date() });
      await db
        .insert(subjectCategoryTable)
        .values([
          { subjectId, categoryId: science },
          { subjectId, categoryId: humanities },
        ]);

      const [{ insertId: orphanSubjectId }] = await db
        .insert(subjectTable)
        .values({ name: 'uncategorised subject', createdAt: new Date() });
      await db.insert(examSubjectTable).values({ examId, subjectId: orphanSubjectId });
      const [{ insertId: orphanGroupId }] = await db
        .insert(conceptGroupTable)
        .values({ name: 'g', subjectId: orphanSubjectId, createdAt: new Date() });
      const [{ insertId: orphanConceptId }] = await db
        .insert(conceptTable)
        .values({ name: 'c', conceptGroupId: orphanGroupId, createdAt: new Date() });

      const filed = await createQuestion(subjectId, examId, { conceptIds: [conceptId] });
      const unfiled = await createQuestion(orphanSubjectId, examId, {
        conceptIds: [orphanConceptId],
      });

      const body = (await (await getQuestionList()).json()) as {
        data: { id: number; categories: string[] }[];
      };
      expect(body.data.find((q) => q.id === filed.id)!.categories).toEqual(['社會', '自然']);
      // A subject in no category is a real state, not an error.
      expect(body.data.find((q) => q.id === unfiled.id)!.categories).toEqual([]);
    });

    describe('filters', () => {
      /**
       * Two subjects in different categories, two exams/concepts/tags
       * inside the first subject, and three questions -- enough that every
       * dimension has something it must exclude, so a filter that silently
       * does nothing fails instead of passing by coincidence.
       */
      const seedFilterFixture = async () => {
        const db = getDb();
        const name = (value: string) => ({ name: value, createdAt: new Date() });
        const [{ insertId: science }] = await db.insert(categoryTable).values(name('自然'));
        const [{ insertId: humanities }] = await db.insert(categoryTable).values(name('社會'));
        const [{ insertId: subjectA }] = await db.insert(subjectTable).values(name('數學'));
        const [{ insertId: subjectB }] = await db.insert(subjectTable).values(name('歷史'));
        await db.insert(subjectCategoryTable).values([
          { subjectId: subjectA, categoryId: science },
          { subjectId: subjectB, categoryId: humanities },
        ]);

        const [{ insertId: exam1 }] = await db.insert(examTable).values(name('114 學測'));
        const [{ insertId: exam2 }] = await db.insert(examTable).values(name('113 分科'));
        const [{ insertId: examB }] = await db.insert(examTable).values(name('歷史卷'));
        await db.insert(examSubjectTable).values([
          { examId: exam1, subjectId: subjectA },
          { examId: exam2, subjectId: subjectA },
          { examId: examB, subjectId: subjectB },
        ]);

        const [{ insertId: tag1 }] = await db
          .insert(tagTable)
          .values({ ...name('常考'), subjectId: subjectA });
        const [{ insertId: tag2 }] = await db
          .insert(tagTable)
          .values({ ...name('冷門'), subjectId: subjectA });
        const [{ insertId: groupA }] = await db
          .insert(conceptGroupTable)
          .values({ ...name('函數'), subjectId: subjectA });
        const [{ insertId: concept1 }] = await db
          .insert(conceptTable)
          .values({ ...name('二次函數'), conceptGroupId: groupA });
        const [{ insertId: concept2 }] = await db
          .insert(conceptTable)
          .values({ ...name('指數函數'), conceptGroupId: groupA });
        const [{ insertId: groupB }] = await db
          .insert(conceptGroupTable)
          .values({ ...name('近代史'), subjectId: subjectB });
        const [{ insertId: conceptB }] = await db
          .insert(conceptTable)
          .values({ ...name('條約'), conceptGroupId: groupB });

        const a1 = await createQuestion(subjectA, exam1, {
          conceptIds: [concept1],
          tagIds: [tag1],
        });
        const a2 = await createQuestion(subjectA, exam2, {
          conceptIds: [concept2],
          tagIds: [tag2],
        });
        const b = await createQuestion(subjectB, examB, { conceptIds: [conceptB] });

        return {
          science,
          humanities,
          subjectA,
          subjectB,
          exam1,
          exam2,
          tag1,
          tag2,
          concept1,
          concept2,
          a1: a1.id,
          a2: a2.id,
          b: b.id,
        };
      };

      const listedIds = async (query: string) => {
        const res = await getQuestionList(query);
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          data: { id: number }[];
          paginate: { total: number };
        };
        // The filtered total is asserted alongside the rows on every case:
        // a count query that ignored the filter would still return the
        // right page of rows while making the pager offer empty pages.
        expect(body.paginate.total).toBe(body.data.length);
        return body.data.map((q) => q.id).sort((x, y) => x - y);
      };

      it('filters by the subject category', async () => {
        const f = await seedFilterFixture();
        expect(await listedIds(`?categoryId=${f.science}`)).toEqual([f.a1, f.a2]);
        expect(await listedIds(`?categoryId=${f.humanities}`)).toEqual([f.b]);
      });

      it('filters by subject', async () => {
        const f = await seedFilterFixture();
        expect(await listedIds(`?subjectId=${f.subjectA}`)).toEqual([f.a1, f.a2]);
        expect(await listedIds(`?subjectId=${f.subjectB}`)).toEqual([f.b]);
      });

      it('filters by exam, concept and tag', async () => {
        const f = await seedFilterFixture();
        expect(await listedIds(`?examId=${f.exam1}`)).toEqual([f.a1]);
        expect(await listedIds(`?conceptId=${f.concept2}`)).toEqual([f.a2]);
        expect(await listedIds(`?tagId=${f.tag1}`)).toEqual([f.a1]);
      });

      it('combines dimensions with AND', async () => {
        const f = await seedFilterFixture();
        expect(await listedIds(`?categoryId=${f.science}&tagId=${f.tag2}`)).toEqual([f.a2]);
        // Both halves match a question, but not the same one.
        expect(await listedIds(`?examId=${f.exam1}&tagId=${f.tag2}`)).toEqual([]);
      });

      it('counts a 題組 once per filter, not once per link', async () => {
        const db = getDb();
        const f = await seedFilterFixture();
        // Two tags on one question: an EXISTS filter yields one row, a
        // join would yield two and double the total.
        await db
          .insert(questionTagTable)
          .values({ questionId: f.a1, tagId: f.tag2 });
        expect(await listedIds(`?tagId=${f.tag2}`)).toEqual([f.a1, f.a2].sort((x, y) => x - y));
      });

      it('rejects a non-numeric filter with 400', async () => {
        const res = await getQuestionList('?subjectId=abc');
        expect(res.status).toBe(400);
      });
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
      const created = await postQuestions({
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
      // /count only counts enabled questions, and questions are created
      // disabled -- this case is about children not being counted, so the
      // group has to get past the review gate first.
      const group = ((await created.json()) as QuestionDto[][])[0][0];
      await putQuestionEnabled(group.id, { enabled: true });

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

    // A short paper inside a long subject: the exam holds 3 of the
    // subject's 20 questions, and the user asks for 5.
    it('serves every question a small exam holds, not just the per-concept LIMIT', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const db = getDb();
      const [{ insertId: smallExamId }] = await db
        .insert(examTable)
        .values({ name: 'small exam', createdAt: new Date() });
      await db.insert(examSubjectTable).values({ examId: smallExamId, subjectId });

      const wanted: number[] = [];
      for (let i = 0; i < 3; i++)
        wanted.push((await createQuestion(subjectId, smallExamId, { conceptIds: [conceptId] })).id);
      for (let i = 0; i < 17; i++) await createQuestion(subjectId, examId, { conceptIds: [conceptId] });

      const res = await getAdaptive(`?subjectId=${subjectId}&examIds=${smallExamId}&count=5`);
      const body = (await res.json()) as AdaptiveDto[];
      expect(body.map((q) => q.id).sort()).toEqual([...wanted].sort());
    });

    // The same, but the exam's questions all sit in a concept that owns a
    // tiny fraction of the subject. weightedTake used to be derived from
    // that whole-subject fraction (3/203 -> a LIMIT of 1), so two of the
    // three questions on the chosen paper were unreachable. It is derived
    // from the filtered pool now.
    it('does not let a concept with a small share of the subject starve a filtered pool', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const db = getDb();
      const [{ insertId: smallExamId }] = await db
        .insert(examTable)
        .values({ name: 'small exam', createdAt: new Date() });
      await db.insert(examSubjectTable).values({ examId: smallExamId, subjectId });
      const [group] = await db.select().from(conceptGroupTable);
      const [{ insertId: bigConceptId }] = await db
        .insert(conceptTable)
        .values({ name: 'bulk concept', conceptGroupId: group.id, createdAt: new Date() });

      const wanted: number[] = [];
      for (let i = 0; i < 3; i++)
        wanted.push((await createQuestion(subjectId, smallExamId, { conceptIds: [conceptId] })).id);
      // A sibling concept large enough to make the first one's whole-subject
      // share round weightedTake down to 1.
      for (let i = 0; i < 60; i++) await createQuestion(subjectId, examId, { conceptIds: [bigConceptId] });

      const res = await getAdaptive(`?subjectId=${subjectId}&examIds=${smallExamId}&count=5`);
      const body = (await res.json()) as AdaptiveDto[];
      expect(body.map((q) => q.id).sort()).toEqual([...wanted].sort());
    });

    // An abandoned session leaves pending replies behind. They are served
    // first so a practice set stays stable, but only where they belong:
    // handing a 試卷 B leftover to a request filtered to 試卷 A both breaks
    // the filter and costs the user one of their 試卷 A questions, since
    // the leftover counts against `count`.
    it('does not serve a pending question from outside the requested exam', async () => {
      const userId = await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const { subjectId, examId, conceptId } = await seedFixture();
      const db = getDb();
      const [{ insertId: otherExamId }] = await db
        .insert(examTable)
        .values({ name: 'other exam', createdAt: new Date() });
      await db.insert(examSubjectTable).values({ examId: otherExamId, subjectId });

      const wanted: number[] = [];
      for (let i = 0; i < 3; i++)
        wanted.push((await createQuestion(subjectId, examId, { conceptIds: [conceptId] })).id);
      const strayQuestion = await createQuestion(subjectId, otherExamId, { conceptIds: [conceptId] });
      await db.insert(pendingReplyTable).values({
        questionId: strayQuestion.id,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await getAdaptive(`?subjectId=${subjectId}&examIds=${examId}&count=5`);
      const body = (await res.json()) as AdaptiveDto[];
      expect(body.map((q) => q.id)).not.toContain(strayQuestion.id);
      expect(body.map((q) => q.id).sort()).toEqual([...wanted].sort());

      // The leftover is still pending, so it comes back when the user
      // practices the exam it actually belongs to.
      const other = await getAdaptive(`?subjectId=${subjectId}&examIds=${otherExamId}&count=5`);
      expect(((await other.json()) as AdaptiveDto[]).map((q) => q.id)).toContain(strayQuestion.id);
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

    it("returns a 題組's sub-questions in order, and none for a standalone", async () => {
      const { subjectId, examId, conceptId } = await seedFixture();

      const standalone = await createQuestion(subjectId, examId, { conceptIds: [conceptId] });
      const standaloneBody = (await (await getQuestion(standalone.id)).json()) as {
        children: unknown[];
      };
      expect(standaloneBody.children).toEqual([]);

      const groupRes = await postQuestions({
        subjectId,
        examId,
        questions: [
          {
            type: 'GROUP',
            difficulty: 5,
            conceptIds: [conceptId],
            // Submitted out of order, to pin that the response is sorted
            // by sortOrder rather than by insertion.
            childQuestions: [
              { type: 'SINGLE', sortOrder: 1, content: 'second', options: 'A|B', answer: 'B', difficulty: 4 },
              { type: 'SINGLE', sortOrder: 0, content: 'first', options: 'A|B', answer: 'A', difficulty: 3 },
            ],
          },
        ],
      });
      const [[group]] = (await groupRes.json()) as QuestionDto[][];

      const body = (await (await getQuestion(group.id)).json()) as {
        children: {
          content: string;
          answer: string;
          difficulty: number;
          adjustedDifficulty: number;
          sortOrder: number;
        }[];
      };
      expect(body.children.map((c) => c.content)).toEqual(['first', 'second']);
      expect(body.children.map((c) => c.answer)).toEqual(['A', 'B']);
      // Each sub-question keeps its own difficulty, not the parent's, and
      // carries the adjusted value every reader actually displays --
      // seeded from difficulty, so equal to it until the first reply.
      expect(body.children.map((c) => c.difficulty)).toEqual([3, 4]);
      expect(body.children.map((c) => c.adjustedDifficulty)).toEqual([3, 4]);
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

    // The prompt plants this sentinel wherever a figure could not be
    // transcribed. Nothing replaces it automatically, so a stored one is
    // a permanently broken question -- and an enabled one, which makes it
    // a candidate for the public Facebook post.
    it('rejects a question whose content still has an image placeholder', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();

      const res = await postQuestions({
        subjectId,
        examId,
        questions: [
          {
            type: 'SINGLE',
            content: '<p>看圖作答 <img src="https://img-placeholder-1" style="max-width:100%"/></p>',
            options: 'A|B|C|D',
            answer: 'A',
            difficulty: 2,
            conceptIds: [conceptId],
          },
        ],
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: 'QUESTION_IMAGE_PLACEHOLDER' });

      // Nothing was written -- the whole batch rolls back.
      const rows = await getDb().select().from(questionTable);
      expect(rows).toHaveLength(0);
    });

    // A GROUP's figure usually sits in the shared passage, but a child can
    // carry one too, and the child path is the easier one to forget.
    it('rejects a child question holding an image placeholder', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();

      const res = await postQuestions({
        subjectId,
        examId,
        questions: [
          {
            type: 'GROUP',
            content: '<p>題組說明</p>',
            difficulty: 5,
            conceptIds: [conceptId],
            childQuestions: [
              {
                type: 'SINGLE',
                sortOrder: 0,
                content: '1. <img src="https://img-placeholder-2"/> 哪一個正確？',
                options: 'A|B|C|D',
                answer: 'A',
                difficulty: 5,
              },
            ],
          },
        ],
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: 'QUESTION_IMAGE_PLACEHOLDER' });
    });

    // A CLOZE passage's blank count has to match answer.length, because
    // the frontend lays out one answer row per character of answer and
    // labels those rows from the passage's own data-blank numbers. A
    // mismatch is silent everywhere downstream -- the rows just stop
    // lining up with the article and every blank past the gap is scored
    // against the wrong position -- so it is rejected at the door.
    describe('CLOZE blank count', () => {
      const clozePassage = (blanks: number) =>
        Array.from(
          { length: blanks },
          (_, i) => `<u data-blank="${31 + i}">&nbsp;&nbsp;${31 + i}&nbsp;&nbsp;</u>`
        ).join(' ');

      const postCloze = async (
        subjectId: number,
        examId: number,
        conceptId: number,
        content: string,
        answer: string
      ) =>
        postQuestions({
          subjectId,
          examId,
          questions: [
            {
              type: 'CLOZE',
              content,
              options: 'A|B|C|D|E',
              answer,
              difficulty: 5,
              conceptIds: [conceptId],
            },
          ],
        });

      it('accepts a CLOZE whose data-blank count equals answer.length', async () => {
        const { subjectId, examId, conceptId } = await seedFixture();

        const res = await postCloze(subjectId, examId, conceptId, clozePassage(5), 'CADBE');
        expect(res.status).toBe(201);

        const rows = await getDb().select().from(questionTable);
        expect(rows).toHaveLength(1);
        expect(rows[0].type).toBe('CLOZE');
        // Top-level, not a GROUP child: a passage is a whole question.
        expect(rows[0].parentId).toBeNull();
        expect(rows[0].isGroup).toBe(false);
      });

      // Only the count is checked, never the values. The blank numbers are
      // the original paper's, so a passage lifted from 第二部分 starts at
      // 31, and a paper can repeat a number across sections or skip one.
      // The answer string is positional, so those numbers are labels --
      // this pins that down against a later "numbers must ascend from 1"
      // check, which FILL does need (its rows are hard-numbered 1..n) but
      // which would reject perfectly good CLOZE passages.
      it('accepts blank numbers that do not start at 1, ascend, or run contiguously', async () => {
        const { subjectId, examId, conceptId } = await seedFixture();
        const scattered = [40, 31, 7, 99]
          .map((n) => `<u data-blank="${n}">&nbsp;&nbsp;${n}&nbsp;&nbsp;</u>`)
          .join(' ');

        const res = await postCloze(subjectId, examId, conceptId, scattered, 'CADB');
        expect(res.status).toBe(201);
      });

      it('rejects a CLOZE with more blanks than answer characters', async () => {
        const { subjectId, examId, conceptId } = await seedFixture();

        const res = await postCloze(subjectId, examId, conceptId, clozePassage(5), 'CADB');
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ code: 'QUESTION_CLOZE_BLANK_MISMATCH' });

        // Nothing was written -- the whole batch rolls back.
        expect(await getDb().select().from(questionTable)).toHaveLength(0);
      });

      it('rejects a CLOZE with fewer blanks than answer characters', async () => {
        const { subjectId, examId, conceptId } = await seedFixture();

        const res = await postCloze(subjectId, examId, conceptId, clozePassage(3), 'CADBE');
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ code: 'QUESTION_CLOZE_BLANK_MISMATCH' });
      });

      // The likeliest extraction failure: the model writes the blanks as
      // plain (31) or __31__ and drops data-blank entirely. Counting zero
      // against a zero-length answer would otherwise pass this check.
      it('rejects a CLOZE whose passage has no data-blank marker at all', async () => {
        const { subjectId, examId, conceptId } = await seedFixture();

        const res = await postCloze(
          subjectId,
          examId,
          conceptId,
          '<p>The answer is <u>&nbsp;&nbsp;31&nbsp;&nbsp;</u> here.</p>',
          'C'
        );
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ code: 'QUESTION_CLOZE_NO_BLANK' });
      });

      it('leaves non-CLOZE types alone, blanks or not', async () => {
        const { subjectId, examId, conceptId } = await seedFixture();

        const res = await postQuestions({
          subjectId,
          examId,
          questions: [
            {
              type: 'SINGLE',
              content: '<p>no data-blank anywhere</p>',
              options: 'A|B',
              answer: 'A',
              difficulty: 5,
              conceptIds: [conceptId],
            },
          ],
        });
        expect(res.status).toBe(201);
      });

      // PUT is the admin's edit path, so a mismatch can be introduced
      // after creation just as easily as during it.
      it('rejects a PUT that leaves the blank count and answer out of step', async () => {
        const { subjectId, examId, conceptId } = await seedFixture();
        const created = await createQuestion(subjectId, examId, { conceptIds: [conceptId] });

        const res = await putQuestion(created.id, {
          type: 'CLOZE',
          content: clozePassage(5),
          options: 'A|B|C|D|E',
          answer: 'CAD',
          difficulty: 5,
          examId,
        });
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ code: 'QUESTION_CLOZE_BLANK_MISMATCH' });
      });

      it('accepts a PUT that converts a question to a well-formed CLOZE', async () => {
        const { subjectId, examId, conceptId } = await seedFixture();
        const created = await createQuestion(subjectId, examId, { conceptIds: [conceptId] });

        const res = await putQuestion(created.id, {
          type: 'CLOZE',
          content: clozePassage(5),
          options: 'A|B|C|D|E',
          answer: 'CADBE',
          difficulty: 5,
          examId,
        });
        expect(res.status).toBe(200);
      });
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

  describe('PUT /:id/enabled', () => {
    // The Facebook auto-poster disarms its own EventBridge rule when it
    // finds nothing enabled to post, so a question left disabled on
    // creation silently stops the whole poster until someone notices.
    it('creates questions enabled', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      const q = await createQuestion(subjectId, examId, { conceptIds: [conceptId] });

      const res = await getQuestion(q.id);
      expect(((await res.json()) as { enabled: boolean }).enabled).toBe(true);
    });

    it("creates a group's children enabled alongside their parent", async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      const res = await postQuestions({
        subjectId,
        examId,
        questions: [
          {
            type: 'GROUP',
            content: 'passage',
            difficulty: 5,
            conceptIds: [conceptId],
            childQuestions: [
              {
                type: 'SINGLE',
                sortOrder: 0,
                content: 'child',
                options: 'A|B',
                answer: 'A',
                difficulty: 5,
              },
            ],
          },
        ],
      });
      const [[parent]] = (await res.json()) as { id: number }[][];

      const children = await getDb()
        .select({ enabled: questionTable.enabled })
        .from(questionTable)
        .where(eq(questionTable.parentId, parent.id));
      expect(children).toHaveLength(1);
      expect(children[0].enabled).toBe(true);
    });

    it('can be created hidden by disabling it afterwards', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      const q = await createQuestion(subjectId, examId, {
        conceptIds: [conceptId],
        enabled: false,
      });

      const res = await getQuestion(q.id);
      expect(((await res.json()) as { enabled: boolean }).enabled).toBe(false);
    });

    it('enables and disables a question', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      const q = await createQuestion(subjectId, examId, {
        conceptIds: [conceptId],
        enabled: false,
      });

      expect((await putQuestionEnabled(q.id, { enabled: true })).status).toBe(200);
      let body = (await (await getQuestion(q.id)).json()) as { enabled: boolean };
      expect(body.enabled).toBe(true);

      expect((await putQuestionEnabled(q.id, { enabled: false })).status).toBe(200);
      body = (await (await getQuestion(q.id)).json()) as { enabled: boolean };
      expect(body.enabled).toBe(false);
    });

    it("carries a group's children along with it", async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      const res = await postQuestions({
        subjectId,
        examId,
        questions: [
          {
            type: 'GROUP',
            content: 'group stem',
            difficulty: 5,
            conceptIds: [conceptId],
            childQuestions: [
              {
                type: 'SINGLE',
                sortOrder: 0,
                content: 'child',
                options: 'A|B',
                answer: 'A',
                difficulty: 5,
              },
            ],
          },
        ],
      });
      const created = (await res.json()) as QuestionDto[][];
      const parent = created[0][0];
      const child = created[0][1];

      await putQuestionEnabled(parent.id, { enabled: true });

      const db = getDb();
      const [childRow] = await db
        .select()
        .from(questionTable)
        .where(eq(questionTable.id, child.id));
      expect(childRow.enabled).toBe(true);
    });

    it('refuses to toggle a child on its own', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      const res = await postQuestions({
        subjectId,
        examId,
        questions: [
          {
            type: 'GROUP',
            content: 'group stem',
            difficulty: 5,
            conceptIds: [conceptId],
            childQuestions: [
              {
                type: 'SINGLE',
                sortOrder: 0,
                content: 'child',
                options: 'A|B',
                answer: 'A',
                difficulty: 5,
              },
            ],
          },
        ],
      });
      const child = ((await res.json()) as QuestionDto[][])[0][1];

      expect((await putQuestionEnabled(child.id, { enabled: true })).status).toBe(400);
    });

    it('returns 404 for an unknown question', async () => {
      expect((await putQuestionEnabled(999999, { enabled: true })).status).toBe(404);
    });

    it('rejects a non-boolean enabled with 400', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      const q = await createQuestion(subjectId, examId, { conceptIds: [conceptId] });

      expect((await putQuestionEnabled(q.id, { enabled: 'yes' })).status).toBe(400);
    });

    it('rejects with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      expect((await putQuestionEnabled(1, { enabled: true })).status).toBe(401);
    });

    it('shows the flag on the admin list', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      await createQuestion(subjectId, examId, { conceptIds: [conceptId], enabled: false });

      const body = (await (await getQuestionList()).json()) as {
        data: { enabled: boolean }[];
      };
      expect(body.data[0].enabled).toBe(false);
    });
  });

  describe('the enabled gate on user-facing reads', () => {
    it('does not serve a disabled question from /adaptive', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      await createQuestion(subjectId, examId, { conceptIds: [conceptId], enabled: false });

      const res = await getAdaptive(`?subjectId=${subjectId}&count=1`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it('serves it once enabled', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const q = await createQuestion(subjectId, examId, {
        conceptIds: [conceptId],
        enabled: false,
      });

      expect(await (await getAdaptive(`?subjectId=${subjectId}&count=1`)).json()).toEqual([]);

      await putQuestionEnabled(q.id, { enabled: true });
      const body = (await (await getAdaptive(`?subjectId=${subjectId}&count=1`)).json()) as {
        id: number;
      }[];
      expect(body.map((d) => d.id)).toEqual([q.id]);
    });

    it('excludes disabled questions from /count', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      await createQuestion(subjectId, examId, { conceptIds: [conceptId] });
      await createQuestion(subjectId, examId, { conceptIds: [conceptId], enabled: false });

      const body = (await (await getQuestionCount(`?subjectId=${subjectId}`)).json()) as {
        total: number;
      };
      expect(body.total).toBe(1);
    });

    it('keeps a disabled question visible in reply history', async () => {
      // Disabling is a forward-looking gate, not a retraction -- a user who
      // already answered a question must keep seeing it in their history.
      const { subjectId, examId, conceptId } = await seedFixture();
      const userId = await seedUser();
      const q = await createQuestion(subjectId, examId, { conceptIds: [conceptId] });

      const db = getDb();
      const now = new Date();
      await db.insert(replyTable).values({
        questionId: q.id,
        subjectId,
        userId,
        repliedAnswer: 'A',
        score: 1,
        repliedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      await putQuestionEnabled(q.id, { enabled: false });

      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');
      const res = await app.request('/api/reply');
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: { children: { questionId: number }[] }[];
      };
      expect(
        body.data.some((group) => group.children.some((child) => child.questionId === q.id))
      ).toBe(true);
    });
  });

  describe('POST /image/figure', () => {
    beforeEach(() => {
      vi.mocked(uploadToS3).mockReset();
    });

    it('stores the figure under questions/figures/ and returns its url', async () => {
      vi.mocked(uploadToS3).mockResolvedValue({
        url: 'https://bucket.s3.ap-east-2.amazonaws.com/questions/figures/abc.png',
        key: 'questions/figures/abc.png',
      });

      const res = await postQuestionFigure({ mimeType: 'image/png', data: PNG_BASE64 });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        url: 'https://bucket.s3.ap-east-2.amazonaws.com/questions/figures/abc.png',
      });

      const [body, contentType, key] = vi.mocked(uploadToS3).mock.calls[0];
      // Decoded before upload -- storing the base64 text would give an
      // object that serves as a broken image.
      expect(Buffer.isBuffer(body)).toBe(true);
      expect(body.equals(Buffer.from(PNG_BASE64, 'base64'))).toBe(true);
      expect(contentType).toBe('image/png');
      // Under questions/ because that is the only prefix the bucket
      // grants public read on; the nested figures/ still keeps these clear
      // of the transient Facebook renders at questions/<uuid>.png, which
      // get deleted after posting.
      expect(key).toMatch(/^questions\/figures\/[0-9a-f-]+\.png$/);
    });

    // These types reach a student's browser in an <img>, unlike the ones
    // POST /image sends to Gemini, which only has to read them.
    it('rejects types that cannot render in an img', async () => {
      for (const mimeType of ['application/pdf', 'image/heic']) {
        const res = await postQuestionFigure({ mimeType, data: PNG_BASE64 });
        expect(res.status).toBe(400);
      }
      expect(uploadToS3).not.toHaveBeenCalled();
    });

    it('rejects a non-admin caller', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);
      expect((await postQuestionFigure({ mimeType: 'image/png', data: PNG_BASE64 })).status).toBe(
        401
      );

      vi.mocked(verifyIdToken).mockResolvedValue('someone-else@example.com');
      expect((await postQuestionFigure({ mimeType: 'image/png', data: PNG_BASE64 })).status).toBe(
        403
      );
      expect(uploadToS3).not.toHaveBeenCalled();
    });
  });

  describe('GET /image/prompt', () => {
    it('returns the same prompt POST /image would have sent', async () => {
      const { subjectId, conceptId } = await seedFixture();

      const res = await getQuestionImagePrompt(`?subjectId=${subjectId}`);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body).toMatchObject({ subjectId, subjectName: 'fixture subject', imageCount: 1 });
      // The point of the endpoint: what an admin pastes into a chat GUI
      // has to carry the rules AND the subject's concept list, or the
      // JSON that comes back cannot be assigned to a concept.
      expect(body.userPrompt).toContain(`fixture concept=${conceptId}`);
      expect(body.userPrompt).toContain('fixture subject');
      expect(body.systemInstruction).toContain('JSON');
      // The two halves stay separate so a GUI with a system-instruction
      // field can mirror the API call; nothing pre-joins them.
      expect(body).not.toHaveProperty('prompt');
    });

    // A prompt fetched for one image but used with several crops would
    // invite the "N crops came back as N questions" mistake.
    it('reflects imageCount and the optional note', async () => {
      const { subjectId } = await seedFixture();

      const res = await getQuestionImagePrompt(
        `?subjectId=${subjectId}&imageCount=3&note=${encodeURIComponent('the answer is B')}`
      );
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.imageCount).toBe(3);
      expect(body.userPrompt).toContain('3');
      expect(body.userPrompt).toContain('the answer is B');
    });

    // This drift is the one that would make the manual fallback useless
    // without failing: the same inputs must produce the same prompt the
    // automatic path builds.
    it('matches the prompt POST /image passes to the model', async () => {
      const { subjectId } = await seedFixture();
      vi.mocked(generateJsonFromImages).mockReset();
      vi.mocked(generateJsonFromImages).mockResolvedValue('[]');

      await postQuestionImage({
        subjectId,
        images: [{ mimeType: 'image/png', data: PNG_BASE64 }],
        note: 'shared note',
      });
      const [sentInstruction, sentPrompt] = vi.mocked(generateJsonFromImages).mock.calls[0];

      const res = await getQuestionImagePrompt(
        `?subjectId=${subjectId}&note=${encodeURIComponent('shared note')}`
      );
      const body = await res.json();

      // Exact equality, not containment: each half has to be what the API
      // sends and nothing else, or the manual route quietly produces
      // different JSON than the automatic one.
      expect(body.systemInstruction).toBe(sentInstruction.trim());
      expect(body.userPrompt).toBe(sentPrompt);
    });

    // adminAuth lets GETs through, so this route carries requireAdmin.
    // Without it any signed-in user could read the full instruction.
    it('rejects a caller who is not an admin', async () => {
      const { subjectId } = await seedFixture();

      vi.mocked(verifyIdToken).mockResolvedValue(null);
      expect((await getQuestionImagePrompt(`?subjectId=${subjectId}`)).status).toBe(401);

      vi.mocked(verifyIdToken).mockResolvedValue('someone-else@example.com');
      expect((await getQuestionImagePrompt(`?subjectId=${subjectId}`)).status).toBe(403);
    });

    it('404s an unknown subject and 400s one with no concepts', async () => {
      expect((await getQuestionImagePrompt('?subjectId=999999')).status).toBe(404);

      const db = getDb();
      const [{ insertId: bareSubjectId }] = await db
        .insert(subjectTable)
        .values({ name: 'no concepts', createdAt: new Date() });
      expect((await getQuestionImagePrompt(`?subjectId=${bareSubjectId}`)).status).toBe(400);
    });
  });

  describe('POST /image', () => {
    // Nothing in vitest.config.ts resets mocks between cases, so the call
    // assertions below ("the model was never reached") would otherwise see
    // calls left over from earlier cases in this block.
    beforeEach(() => {
      vi.mocked(generateJsonFromImages).mockReset();
    });

    it('returns the extracted questions and passes the concept list to the model', async () => {
      const { subjectId, conceptId } = await seedFixture();
      vi.mocked(generateJsonFromImages).mockResolvedValue(
        JSON.stringify([
          {
            type: 'SINGLE',
            content: '<p>1 + 1 = ?</p>',
            options: 'A|B|C|D',
            answer: 'B',
            difficulty: 2,
            conceptIds: [conceptId],
          },
        ])
      );

      const res = await postQuestionImage({
        subjectId,
        images: [{ mimeType: 'image/png', data: PNG_BASE64 }],
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        subjectId,
        questions: [
          {
            type: 'SINGLE',
            content: '<p>1 + 1 = ?</p>',
            options: 'A|B|C|D',
            answer: 'B',
            difficulty: 2,
            conceptIds: [conceptId],
          },
        ],
      });

      // The subject's concepts reach the model as the prompt's
      // "name=id" form, which is what it picks conceptIds out of.
      const [, prompt, images, schema] = vi.mocked(generateJsonFromImages).mock.calls[0];
      expect(prompt).toContain('一道題目');
      expect(prompt).toContain(`fixture concept=${conceptId}`);
      expect(prompt).toContain('fixture subject');
      expect(images).toEqual([{ mimeType: 'image/png', data: PNG_BASE64 }]);
      // Structured output is what keeps the reply parseable -- a call that
      // forgot the schema would still pass every other assertion here.
      expect(schema).toMatchObject({ type: 'array' });
    });

    // The whole point of the 429 is that it reaches the browser as a 429.
    // genai.ts classifies the provider's refusal, errorResponse.ts maps it,
    // and the UI switches on the code -- so a regression anywhere in that
    // chain shows up as the admin being told to retry a quota wall.
    it('surfaces an AI rate limit as 429 with code AI_RATE_LIMITED', async () => {
      const { subjectId } = await seedFixture();
      vi.mocked(generateJsonFromImages).mockRejectedValue(
        new TooManyRequestsError('AI provider rate limit reached', 'AI_RATE_LIMITED')
      );

      const res = await postQuestionImage({
        subjectId,
        images: [{ mimeType: 'image/png', data: PNG_BASE64 }],
      });

      expect(res.status).toBe(429);
      expect(await res.json()).toMatchObject({
        status: 429,
        name: 'TooManyRequestsError',
        code: 'AI_RATE_LIMITED',
      });
    });

    // A capacity dip has to stay distinguishable from the quota wall
    // above, because the two tell the admin different things.
    it('keeps a provider outage as 502 with code AI_UNAVAILABLE', async () => {
      const { subjectId } = await seedFixture();
      vi.mocked(generateJsonFromImages).mockRejectedValue(
        new BadGatewayError('AI provider is unavailable', 'AI_UNAVAILABLE')
      );

      const res = await postQuestionImage({
        subjectId,
        images: [{ mimeType: 'image/png', data: PNG_BASE64 }],
      });

      expect(res.status).toBe(502);
      expect(await res.json()).toMatchObject({ status: 502, code: 'AI_UNAVAILABLE' });
    });

    it('appends an optional note to the prompt', async () => {
      const { subjectId } = await seedFixture();
      vi.mocked(generateJsonFromImages).mockResolvedValue('[]');

      await postQuestionImage({
        subjectId,
        images: [{ mimeType: 'image/png', data: PNG_BASE64 }],
        note: 'the answer is B',
      });

      const [, prompt] = vi.mocked(generateJsonFromImages).mock.calls[0];
      expect(prompt).toContain('the answer is B');
    });

    it('tells the model to merge several crops into one question', async () => {
      const { subjectId } = await seedFixture();
      vi.mocked(generateJsonFromImages).mockResolvedValue('[]');

      await postQuestionImage({
        subjectId,
        images: [
          { mimeType: 'image/png', data: PNG_BASE64 },
          { mimeType: 'image/png', data: PNG_BASE64 },
        ],
      });

      // Several crops of one long question being split back into several
      // questions is the failure that costs the admin a re-run, so the
      // count and the merge instruction both have to reach the model.
      const [, prompt] = vi.mocked(generateJsonFromImages).mock.calls[0];
      expect(prompt).toContain('2');
      expect(prompt).toContain('同一道題目');
    });

    it('rejects more than 3 images with 400', async () => {
      const { subjectId } = await seedFixture();

      const res = await postQuestionImage({
        subjectId,
        images: Array.from({ length: 4 }, () => ({
          mimeType: 'image/png',
          data: PNG_BASE64,
        })),
      });
      expect(res.status).toBe(400);
      expect(generateJsonFromImages).not.toHaveBeenCalled();
    });

    it('drops concept ids that do not belong to the subject', async () => {
      const { subjectId, conceptId } = await seedFixture();
      vi.mocked(generateJsonFromImages).mockResolvedValue(
        JSON.stringify([
          {
            type: 'SINGLE',
            content: '<p>x</p>',
            options: 'A|B',
            answer: 'A',
            difficulty: 5,
            conceptIds: [conceptId, conceptId + 9999],
          },
        ])
      );

      const res = await postQuestionImage({
        subjectId,
        images: [{ mimeType: 'image/png', data: PNG_BASE64 }],
      });
      const body = (await res.json()) as { questions: { conceptIds: number[] }[] };
      expect(body.questions[0].conceptIds).toEqual([conceptId]);
    });

    it('normalizes away the null options/answer on a GROUP question', async () => {
      const { subjectId, conceptId } = await seedFixture();
      vi.mocked(generateJsonFromImages).mockResolvedValue(
        JSON.stringify([
          {
            type: 'GROUP',
            content: '<p>group stem</p>',
            options: null,
            answer: null,
            difficulty: 5,
            conceptIds: [conceptId],
            childQuestions: [
              {
                type: 'SINGLE',
                sortOrder: 0,
                content: '<p>child</p>',
                options: 'A|B|C|D',
                answer: 'A',
                difficulty: 5,
              },
            ],
          },
        ])
      );

      const res = await postQuestionImage({
        subjectId,
        images: [{ mimeType: 'image/png', data: PNG_BASE64 }],
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        questions: { options?: string; answer?: string; childQuestions: unknown[] }[];
      };
      expect(body.questions[0].options).toBeUndefined();
      expect(body.questions[0].answer).toBeUndefined();
      expect(body.questions[0].childQuestions).toHaveLength(1);
    });

    it('returns 502 when the model replies with something that is not JSON', async () => {
      const { subjectId } = await seedFixture();
      vi.mocked(generateJsonFromImages).mockResolvedValue('sorry, I cannot read this paper');

      const res = await postQuestionImage({
        subjectId,
        images: [{ mimeType: 'image/png', data: PNG_BASE64 }],
      });
      expect(res.status).toBe(502);
      expect(await res.json()).toMatchObject({ code: 'AI_INVALID_JSON' });
    });

    it('returns 502 when the model replies with JSON of the wrong shape', async () => {
      const { subjectId } = await seedFixture();
      vi.mocked(generateJsonFromImages).mockResolvedValue(
        JSON.stringify([{ type: 'ESSAY', content: '<p>essay</p>', difficulty: 5 }])
      );

      const res = await postQuestionImage({
        subjectId,
        images: [{ mimeType: 'image/png', data: PNG_BASE64 }],
      });
      expect(res.status).toBe(502);
      expect(await res.json()).toMatchObject({ code: 'AI_INVALID_SHAPE' });
    });

    it('returns 404 for an unknown subject without calling the model', async () => {
      const res = await postQuestionImage({
        subjectId: 999999,
        images: [{ mimeType: 'image/png', data: PNG_BASE64 }],
      });
      expect(res.status).toBe(404);
      expect(generateJsonFromImages).not.toHaveBeenCalled();
    });

    it('returns 400 for a subject with no concepts without calling the model', async () => {
      const db = getDb();
      const [{ insertId: subjectId }] = await db
        .insert(subjectTable)
        .values({ name: 'conceptless subject', createdAt: new Date() });

      const res = await postQuestionImage({
        subjectId,
        images: [{ mimeType: 'image/png', data: PNG_BASE64 }],
      });
      expect(res.status).toBe(400);
      expect(generateJsonFromImages).not.toHaveBeenCalled();
    });

    it('rejects an empty images array with 400', async () => {
      const { subjectId } = await seedFixture();

      const res = await postQuestionImage({ subjectId, images: [] });
      expect(res.status).toBe(400);
    });

    it('rejects an unsupported mime type with 400', async () => {
      const { subjectId } = await seedFixture();

      const res = await postQuestionImage({
        subjectId,
        images: [{ mimeType: 'image/gif', data: PNG_BASE64 }],
      });
      expect(res.status).toBe(400);
    });

    it('rejects with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await postQuestionImage({
        subjectId: 1,
        images: [{ mimeType: 'image/png', data: PNG_BASE64 }],
      });
      expect(res.status).toBe(401);
    });
  });

  /**
   * What the OpenAPI document promises, against what is sent.
   *
   * The key checks carry the weight here. `question` has a
   * `duration_median_ms` column -- the per-question median reply time
   * the points time-weight reads -- and three of these handlers used to
   * send it, because they returned the row. `satisfies` alone would not
   * have caught that: excess-property checking does not reach a
   * property arriving through a spread, and never reaches a bare
   * variable. These assertions do.
   */
  describe('the OpenAPI document', () => {
    const rowKeys = [
      'adjustedDifficulty',
      'answer',
      'attempCount',
      'content',
      'createdAt',
      'difficulty',
      'enabled',
      'fbPostId',
      'id',
      'isGroup',
      'options',
      'parentId',
      'scoringTotal',
      'sortOrder',
      'subjectId',
      'type',
      'updatedAt',
      'uuid',
    ];

    it('describes exactly what creating, reading and updating send', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();

      const created: unknown = await (
        await postQuestions({
          subjectId,
          examId,
          questions: [
            {
              type: 'SINGLE',
              content: 'documented',
              options: 'A|B',
              answer: 'A',
              difficulty: 5,
              conceptIds: [conceptId],
            },
          ],
        })
      ).json();

      expect(postQuestionResponseSchema.safeParse(created).error?.issues ?? []).toEqual([]);
      // Nested: one array per submitted question, holding the question
      // and then its children. PostQuestionResponse says Question[].
      const rows = (created as object[][])[0];
      expect(Object.keys(rows[0]).sort()).toEqual(rowKeys);
      const id = (rows[0] as { id: number }).id;

      const one: unknown = await (await getQuestion(id)).json();
      expect(getQuestionByIdResponseSchema.safeParse(one).error?.issues ?? []).toEqual([]);
      expect(Object.keys(one as object).sort()).toEqual(
        [...rowKeys, 'examId', 'tagIds', 'conceptIds', 'children'].sort()
      );

      const updated: unknown = await (
        await putQuestion(id, {
          type: 'SINGLE',
          content: 'documented still',
          options: 'A|B',
          answer: 'A',
          difficulty: 6,
          examId,
        })
      ).json();
      expect(questionRowSchema.safeParse(updated).error?.issues ?? []).toEqual([]);
      expect(Object.keys(updated as object).sort()).toEqual(rowKeys);

      const list: unknown = await (await getQuestionList()).json();
      expect(getQuestionListResponseSchema.safeParse(list).error?.issues ?? []).toEqual([]);
      expect(Object.keys(list as object).sort()).toEqual(['data', 'paginate']);
      // Twelve fields, and `subject` is a name rather than the object the
      // old hand-written Question declared.
      expect(Object.keys((list as { data: object[] }).data[0]).sort()).toEqual([
        'answer',
        'categories',
        'childCount',
        'content',
        'difficulty',
        'enabled',
        'id',
        'isGroup',
        'options',
        'subject',
        'subjectId',
        'type',
      ]);
      expect((list as { data: { subject: unknown }[] }).data[0].subject).toEqual(
        expect.any(String)
      );

      const count: unknown = await (await getQuestionCount(`?subjectId=${subjectId}`)).json();
      expect(getQuestionCountResponseSchema.safeParse(count).error?.issues ?? []).toEqual([]);
      expect(Object.keys(count as object).sort()).toEqual(['total']);
    });

    it('describes exactly what the link and enabled writes send', async () => {
      const { subjectId, examId, tagId, conceptId } = await seedFixture();
      const question = await createQuestion(subjectId, examId, { conceptIds: [conceptId] });

      const tags: unknown = await (await putQuestionTag(question.id, { tagIds: [tagId] })).json();
      expect(questionTagResponseSchema.safeParse(tags).error?.issues ?? []).toEqual([]);
      expect(Object.keys(tags as object).sort()).toEqual(['tagIds']);
      expect(
        questionTagResponseSchema.safeParse(await (await getQuestionTag(question.id)).json()).error
          ?.issues ?? []
      ).toEqual([]);

      const concepts: unknown = await (
        await putQuestionConcept(question.id, { conceptIds: [conceptId] })
      ).json();
      expect(questionConceptResponseSchema.safeParse(concepts).error?.issues ?? []).toEqual([]);
      expect(Object.keys(concepts as object).sort()).toEqual(['conceptIds']);
      expect(
        questionConceptResponseSchema.safeParse(
          await (await getQuestionConcept(question.id)).json()
        ).error?.issues ?? []
      ).toEqual([]);

      const enabled: unknown = await (
        await putQuestionEnabled(question.id, { enabled: false })
      ).json();
      expect(putQuestionEnabledResponseSchema.safeParse(enabled).error?.issues ?? []).toEqual([]);
      expect(Object.keys(enabled as object).sort()).toEqual(['enabled', 'id']);
    });

    it('describes exactly what the adaptive selection sends, answers masked', async () => {
      const { subjectId, examId, conceptId } = await seedFixture();
      await createQuestion(subjectId, examId, { conceptIds: [conceptId], answer: 'A' });
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue('fixture-uid');

      const body: unknown = await (await getAdaptive(`?subjectId=${subjectId}`)).json();

      const parsed = getQuestionAdaptiveResponseSchema.safeParse(body);
      expect(parsed.error?.issues ?? []).toEqual([]);
      expect(parsed.success).toBe(true);
      const [question] = body as { answer: string; children: object[] }[];
      expect(Object.keys(question).sort()).toEqual([
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
      ]);
      // Masked, not omitted: same length, no key. The history and review
      // endpoints send the real one; this caller has not answered yet.
      expect(question.answer).toBe('\u2022');
      // And no attempCount, scoringTotal, enabled or timestamps here --
      // this is the practice shape, not the admin row.
      expect(Object.keys(question)).not.toContain('attempCount');
      expect(Object.keys(question)).not.toContain('enabled');
    });
  });
});
