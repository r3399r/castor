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
  questionConceptTable,
  questionExamTable,
  questionTable,
  questionTagTable,
  subjectTable,
  tagTable,
} from 'src/db/schema';
import { ADMIN_EMAILS } from 'src/middleware/adminAuth';

// The admin gate is exercised end-to-end in its own describe block below;
// every other test just needs writes to succeed, so default the mocked
// Firebase verification to the admin identity.
vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdToken: vi.fn() }));
import { verifyIdToken } from 'src/lib/firebaseAdmin';

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

const postQuestion = (body: unknown) =>
  app.request('/api/question', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const clearTables = async () => {
  const db = getDb();
  await db.delete(questionTagTable);
  await db.delete(questionConceptTable);
  await db.delete(questionExamTable);
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

    const res = await postQuestion({
      subjectId,
      type: 'SINGLE',
      content: 'what is 1+1?',
      options: 'A|B|C|D',
      answer: 'B',
      difficulty: 3,
      examId,
      conceptIds: [conceptId],
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as QuestionDto[];
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      subjectId,
      parentId: null,
      isGroup: false,
      type: 'SINGLE',
      content: 'what is 1+1?',
      answer: 'B',
      difficulty: 3,
      adjustedDifficulty: 3,
    });
    expect(body[0].uuid).toEqual(expect.any(String));

    const db = getDb();
    const [examLink] = await db
      .select()
      .from(questionExamTable)
      .where(eq(questionExamTable.questionId, body[0].id));
    expect(examLink).toMatchObject({ questionId: body[0].id, examId });

    const [conceptLink] = await db
      .select()
      .from(questionConceptTable)
      .where(eq(questionConceptTable.questionId, body[0].id));
    expect(conceptLink).toMatchObject({ questionId: body[0].id, conceptId });

    const [concept] = await db
      .select()
      .from(conceptTable)
      .where(eq(conceptTable.id, conceptId));
    expect(concept.numberOfQuestions).toBe(1);
  });

  it('links tags when tagIds is provided', async () => {
    const { subjectId, examId, tagId, conceptId } = await seedFixture();

    const res = await postQuestion({
      subjectId,
      type: 'SINGLE',
      difficulty: 3,
      examId,
      tagIds: [tagId],
      conceptIds: [conceptId],
    });
    expect(res.status).toBe(201);
    const [{ id: questionId }] = (await res.json()) as QuestionDto[];

    const db = getDb();
    const [tagLink] = await db
      .select()
      .from(questionTagTable)
      .where(eq(questionTagTable.questionId, questionId));
    expect(tagLink).toMatchObject({ questionId, tagId });
  });

  it('creates a GROUP question with childQuestions, each keeping its own difficulty', async () => {
    const { subjectId, examId, conceptId } = await seedFixture();

    const res = await postQuestion({
      subjectId,
      type: 'GROUP',
      difficulty: 5,
      examId,
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
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as QuestionDto[];
    expect(body).toHaveLength(3);

    const [parent, child1, child2] = body;
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

    const res = await postQuestion({
      subjectId,
      type: 'SINGLE',
      difficulty: 3,
      examId,
      conceptIds: [],
    });
    expect(res.status).toBe(400);
  });

  it('404s for an unknown subjectId', async () => {
    const { examId, conceptId } = await seedFixture();

    const res = await postQuestion({
      subjectId: 999999,
      type: 'SINGLE',
      difficulty: 3,
      examId,
      conceptIds: [conceptId],
    });
    expect(res.status).toBe(404);
  });

  it('404s for an unknown examId', async () => {
    const { subjectId, conceptId } = await seedFixture();

    const res = await postQuestion({
      subjectId,
      type: 'SINGLE',
      difficulty: 3,
      examId: 999999,
      conceptIds: [conceptId],
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

    const res = await postQuestion({
      subjectId,
      type: 'SINGLE',
      difficulty: 3,
      examId: unlinkedExamId,
      conceptIds: [conceptId],
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

    const res = await postQuestion({
      subjectId,
      type: 'SINGLE',
      difficulty: 3,
      examId,
      tagIds: [unrelatedTagId],
      conceptIds: [conceptId],
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

    const res = await postQuestion({
      subjectId,
      type: 'SINGLE',
      difficulty: 3,
      examId,
      conceptIds: [unrelatedConceptId],
    });
    expect(res.status).toBe(400);
  });

  it('rejects a difficulty outside 1-10 with 400', async () => {
    const { subjectId, examId, conceptId } = await seedFixture();

    const res = await postQuestion({
      subjectId,
      type: 'SINGLE',
      difficulty: 0,
      examId,
      conceptIds: [conceptId],
    });
    expect(res.status).toBe(400);
  });

  describe('admin auth gate', () => {
    it('rejects a create with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await postQuestion({});
      expect(res.status).toBe(401);
    });

    it('rejects a create with 403 for a non-admin email', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue('someone-else@example.com');

      const res = await postQuestion({});
      expect(res.status).toBe(403);
    });
  });
});
