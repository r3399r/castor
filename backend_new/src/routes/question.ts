import { zValidator } from '@hono/zod-validator';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
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
import { TransactionEnv } from 'src/middleware/transaction';
import { BadRequestError, NotFoundError } from 'src/model/error';

const childQuestionSchema = z.object({
  type: z.enum(['SINGLE', 'MULTIPLE', 'TRUE_FALSE', 'FILL']),
  sortOrder: z.number().int().min(0),
  content: z.string().min(1),
  options: z.string().min(1),
  answer: z.string().min(1),
  difficulty: z.number().int().min(1).max(10),
});

// "solution" is accepted (Gemini's output includes it) but never
// persisted -- there's no column for it on the question table, matching
// the legacy createQuestion's behavior of silently dropping it too.
const questionItemSchema = z.object({
  type: z.enum(['GROUP', 'SINGLE', 'MULTIPLE', 'TRUE_FALSE', 'FILL']),
  content: z.string().optional(),
  options: z.string().optional(),
  answer: z.string().optional(),
  solution: z.string().optional(),
  difficulty: z.number().int().min(1).max(10),
  tagIds: z.array(z.number().int().positive()).optional(),
  conceptIds: z.array(z.number().int().positive()).min(1),
  childQuestions: z.array(childQuestionSchema).optional(),
});

// A batch: every question in it shares the same subject and exam (the
// admin picks those once for the whole paste), submitted together as one
// request so the whole batch commits or none of it does -- this route
// runs inside the transaction middleware already, so a thrown error on
// question N rolls back questions 0..N-1 in the same batch automatically.
export const questionBodySchema = z.object({
  subjectId: z.number().int().positive(),
  examId: z.number().int().positive(),
  questions: z.array(questionItemSchema).min(1),
});

type QuestionItem = z.infer<typeof questionItemSchema>;

const createOneQuestion = async (
  db: TransactionEnv['Variables']['db'],
  subjectId: number,
  examId: number,
  item: QuestionItem
) => {
  const tagIdsSet = [...new Set(item.tagIds ?? [])];
  const tags =
    tagIdsSet.length > 0
      ? await db.select().from(tagTable).where(inArray(tagTable.id, tagIdsSet))
      : [];
  if (tags.length !== tagIdsSet.length)
    throw new BadRequestError('some tags do not exist');
  for (const tag of tags)
    if (tag.subjectId !== subjectId)
      throw new BadRequestError('tag does not belong to the specified subject');

  const conceptIdsSet = [...new Set(item.conceptIds)];
  const concepts = await db
    .select()
    .from(conceptTable)
    .where(inArray(conceptTable.id, conceptIdsSet));
  if (concepts.length !== conceptIdsSet.length)
    throw new BadRequestError('some concepts do not exist');
  const conceptGroups = await db
    .select()
    .from(conceptGroupTable)
    .where(
      inArray(
        conceptGroupTable.id,
        [...new Set(concepts.map((concept) => concept.conceptGroupId))]
      )
    );
  const conceptGroupById = new Map(conceptGroups.map((g) => [g.id, g]));
  for (const concept of concepts) {
    const group = conceptGroupById.get(concept.conceptGroupId);
    if (group === undefined || group.subjectId !== subjectId)
      throw new BadRequestError(
        'concept does not belong to the specified subject'
      );
  }

  for (const conceptId of conceptIdsSet)
    await db
      .update(conceptTable)
      .set({ numberOfQuestions: sql`${conceptTable.numberOfQuestions} + 1` })
      .where(eq(conceptTable.id, conceptId));

  const now = new Date();
  const [{ insertId: questionId }] = await db.insert(questionTable).values({
    uuid: randomUUID(),
    subjectId,
    parentId: null,
    fbPostId: null,
    isGroup: item.type === 'GROUP',
    type: item.type,
    sortOrder: null,
    content: item.content ?? null,
    options: item.options ?? null,
    answer: item.answer ?? null,
    difficulty: item.difficulty,
    adjustedDifficulty: item.difficulty,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(questionExamTable).values({ questionId, examId });
  if (tags.length > 0)
    await db
      .insert(questionTagTable)
      .values(tags.map((tag) => ({ questionId, tagId: tag.id })));
  await db
    .insert(questionConceptTable)
    .values(conceptIdsSet.map((conceptId) => ({ questionId, conceptId })));

  // Each child gets its own difficulty (from its own request field)
  // rather than reusing the parent's -- unlike the legacy
  // createQuestion, which always assigns the parent's difficulty to
  // every child regardless of what was submitted for it. That looks
  // like an oversight there (the field exists on the child schema
  // specifically to be used), so it isn't replicated here.
  const childIds: number[] = [];
  for (const child of item.childQuestions ?? []) {
    const [{ insertId: childId }] = await db.insert(questionTable).values({
      uuid: randomUUID(),
      subjectId,
      parentId: questionId,
      fbPostId: null,
      isGroup: false,
      type: child.type,
      sortOrder: child.sortOrder,
      content: child.content,
      options: child.options,
      answer: child.answer,
      difficulty: child.difficulty,
      adjustedDifficulty: child.difficulty,
      createdAt: now,
      updatedAt: now,
    });
    childIds.push(childId);
  }

  const createdRows = await db
    .select()
    .from(questionTable)
    .where(inArray(questionTable.id, [questionId, ...childIds]));
  const rowById = new Map(createdRows.map((row) => [row.id, row]));
  return [questionId, ...childIds].map((id) => rowById.get(id)!);
};

export const question = new Hono<TransactionEnv>().post(
  '/',
  zValidator('json', questionBodySchema),
  async (c) => {
    const data = c.req.valid('json');
    console.log(
      `POST /api/question subjectId=${data.subjectId} examId=${data.examId} count=${data.questions.length}`
    );
    const db = c.get('db');

    const [subject] = await db
      .select()
      .from(subjectTable)
      .where(eq(subjectTable.id, data.subjectId));
    if (subject === undefined)
      throw new NotFoundError(`subject ${data.subjectId} not found`);

    const [exam] = await db
      .select()
      .from(examTable)
      .where(eq(examTable.id, data.examId));
    if (exam === undefined)
      throw new NotFoundError(`exam ${data.examId} not found`);
    const [examLink] = await db
      .select()
      .from(examSubjectTable)
      .where(
        and(
          eq(examSubjectTable.examId, data.examId),
          eq(examSubjectTable.subjectId, data.subjectId)
        )
      );
    if (examLink === undefined)
      throw new BadRequestError('exam does not belong to the specified subject');

    // Sequential, not Promise.all -- each question's numberOfQuestions
    // increment and insert needs to see the previous one's effects (and
    // parallel writes inside one transaction would just serialize on the
    // connection anyway), so there's no concurrency to gain here.
    const results = [];
    for (const item of data.questions)
      results.push(
        await createOneQuestion(db, data.subjectId, data.examId, item)
      );

    return c.json(results, 201);
  }
);
