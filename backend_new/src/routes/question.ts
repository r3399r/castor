import { zValidator } from '@hono/zod-validator';
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
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
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT } from 'src/lib/paginator';
import { TransactionEnv } from 'src/middleware/transaction';
import { BadRequestError, NotFoundError } from 'src/model/error';

type Db = TransactionEnv['Variables']['db'];

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

// Update is scalar-fields-plus-exam only -- subjectId is deliberately not
// editable here, since tag/concept links are validated against it and
// changing it out from under an existing question would silently orphan
// those links. Tag/concept links get their own relation endpoints below,
// same split as subject's PUT /:id vs PUT /:id/category.
export const questionUpdateBodySchema = z.object({
  type: z.enum(['GROUP', 'SINGLE', 'MULTIPLE', 'TRUE_FALSE', 'FILL']),
  content: z.string().optional(),
  options: z.string().optional(),
  answer: z.string().optional(),
  difficulty: z.number().int().min(1).max(10),
  examId: z.number().int().positive(),
});

export const questionTagBodySchema = z.object({
  tagIds: z.array(z.number().int().positive()),
});

export const questionConceptBodySchema = z.object({
  conceptIds: z.array(z.number().int().positive()).min(1),
});

const QUESTION_SORT_COLUMNS = {
  id: questionTable.id,
  subject: subjectTable.name,
  type: questionTable.type,
  difficulty: questionTable.difficulty,
};

export const questionListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sort: z.enum(['id', 'subject', 'type', 'difficulty']).optional().default('id'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

type QuestionItem = z.infer<typeof questionItemSchema>;

const validateExamForSubject = async (db: Db, subjectId: number, examId: number) => {
  const [exam] = await db.select().from(examTable).where(eq(examTable.id, examId));
  if (exam === undefined) throw new NotFoundError(`exam ${examId} not found`);
  const [examLink] = await db
    .select()
    .from(examSubjectTable)
    .where(
      and(eq(examSubjectTable.examId, examId), eq(examSubjectTable.subjectId, subjectId))
    );
  if (examLink === undefined)
    throw new BadRequestError('exam does not belong to the specified subject');
};

const validateTagsForSubject = async (db: Db, subjectId: number, tagIds: number[]) => {
  const tagIdsSet = [...new Set(tagIds)];
  const tags =
    tagIdsSet.length > 0
      ? await db.select().from(tagTable).where(inArray(tagTable.id, tagIdsSet))
      : [];
  if (tags.length !== tagIdsSet.length)
    throw new BadRequestError('some tags do not exist');
  for (const tag of tags)
    if (tag.subjectId !== subjectId)
      throw new BadRequestError('tag does not belong to the specified subject');
  return tags;
};

const validateConceptsForSubject = async (db: Db, subjectId: number, conceptIds: number[]) => {
  const conceptIdsSet = [...new Set(conceptIds)];
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
      throw new BadRequestError('concept does not belong to the specified subject');
  }
  return concepts;
};

const createOneQuestion = async (
  db: Db,
  subjectId: number,
  examId: number,
  item: QuestionItem
) => {
  const tags = await validateTagsForSubject(db, subjectId, item.tagIds ?? []);
  const conceptIdsSet = [...new Set(item.conceptIds)];
  await validateConceptsForSubject(db, subjectId, conceptIdsSet);

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

export const question = new Hono<TransactionEnv>()
  .get('/', zValidator('query', questionListQuerySchema), async (c) => {
    const { limit, offset, sort, order } = c.req.valid('query');
    console.log(
      `GET /api/question limit=${limit} offset=${offset} sort=${sort} order=${order}`
    );
    const db = c.get('db');

    // Only top-level questions -- a GROUP question's children have no
    // independent meaning without their parent, so they're never listed
    // as their own rows here (childCount below is how the admin sees
    // there's more to a GROUP question than what's shown).
    const [{ total }] = await db
      .select({ total: count() })
      .from(questionTable)
      .where(isNull(questionTable.parentId));
    const sortColumn = QUESTION_SORT_COLUMNS[sort];
    const data = await db
      .select({
        id: questionTable.id,
        subjectId: questionTable.subjectId,
        subject: subjectTable.name,
        type: questionTable.type,
        content: questionTable.content,
        options: questionTable.options,
        answer: questionTable.answer,
        difficulty: questionTable.difficulty,
        isGroup: questionTable.isGroup,
        childCount: sql<number>`(
          SELECT COUNT(*) FROM question c WHERE c.parent_id = question.id
        )`,
      })
      .from(questionTable)
      .innerJoin(subjectTable, eq(subjectTable.id, questionTable.subjectId))
      .where(isNull(questionTable.parentId))
      .orderBy(order === 'desc' ? desc(sortColumn) : asc(sortColumn))
      .limit(limit)
      .offset(offset);

    return c.json({ data, paginate: genPagination(total, limit, offset) });
  })
  .get('/:id', async (c) => {
    const id = Number(c.req.param('id'));
    console.log(`GET /api/question/${id}`);
    const db = c.get('db');

    const [found] = await db.select().from(questionTable).where(eq(questionTable.id, id));
    if (found === undefined) throw new NotFoundError(`question ${id} not found`);

    const [examLink] = await db
      .select({ examId: questionExamTable.examId })
      .from(questionExamTable)
      .where(eq(questionExamTable.questionId, id));
    const tagLinks = await db
      .select({ tagId: questionTagTable.tagId })
      .from(questionTagTable)
      .where(eq(questionTagTable.questionId, id));
    const conceptLinks = await db
      .select({ conceptId: questionConceptTable.conceptId })
      .from(questionConceptTable)
      .where(eq(questionConceptTable.questionId, id));

    return c.json({
      ...found,
      examId: examLink?.examId ?? null,
      tagIds: tagLinks.map((l) => l.tagId),
      conceptIds: conceptLinks.map((l) => l.conceptId),
    });
  })
  .post('/', zValidator('json', questionBodySchema), async (c) => {
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

    await validateExamForSubject(db, data.subjectId, data.examId);

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
  })
  .put('/:id', zValidator('json', questionUpdateBodySchema), async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    const data = c.req.valid('json');
    console.log(`PUT /api/question/${id} type=${data.type} examId=${data.examId}`);

    const [found] = await db.select().from(questionTable).where(eq(questionTable.id, id));
    if (found === undefined) throw new NotFoundError(`question ${id} not found`);

    await validateExamForSubject(db, found.subjectId, data.examId);

    await db
      .update(questionTable)
      .set({
        type: data.type,
        isGroup: data.type === 'GROUP',
        content: data.content ?? null,
        options: data.options ?? null,
        answer: data.answer ?? null,
        difficulty: data.difficulty,
        updatedAt: new Date(),
      })
      .where(eq(questionTable.id, id));

    // Full-set replace, same as subject's /:id/category -- a question
    // only ever has one exam in practice despite the M:N schema.
    await db.delete(questionExamTable).where(eq(questionExamTable.questionId, id));
    await db.insert(questionExamTable).values({ questionId: id, examId: data.examId });

    const [updated] = await db.select().from(questionTable).where(eq(questionTable.id, id));
    return c.json(updated);
  })
  .delete('/:id', async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`DELETE /api/question/${id}`);

    const [found] = await db.select().from(questionTable).where(eq(questionTable.id, id));
    if (found === undefined) throw new NotFoundError(`question ${id} not found`);

    // Symmetric with creation's +1 -- a deleted question should no longer
    // count toward its concepts' numberOfQuestions.
    const conceptLinks = await db
      .select({ conceptId: questionConceptTable.conceptId })
      .from(questionConceptTable)
      .where(eq(questionConceptTable.questionId, id));
    for (const link of conceptLinks)
      await db
        .update(conceptTable)
        .set({ numberOfQuestions: sql`${conceptTable.numberOfQuestions} - 1` })
        .where(eq(conceptTable.id, link.conceptId));

    await db.delete(questionTagTable).where(eq(questionTagTable.questionId, id));
    await db.delete(questionConceptTable).where(eq(questionConceptTable.questionId, id));
    await db.delete(questionExamTable).where(eq(questionExamTable.questionId, id));
    // A GROUP question's children have no independent join rows of their
    // own (only the parent gets exam/tag/concept links), so they're just
    // deleted outright once the parent's own links are gone.
    await db.delete(questionTable).where(eq(questionTable.parentId, id));
    await db.delete(questionTable).where(eq(questionTable.id, id));

    return c.body(null, 204);
  })
  .get('/:id/tag', async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`GET /api/question/${id}/tag`);

    const [found] = await db.select().from(questionTable).where(eq(questionTable.id, id));
    if (found === undefined) throw new NotFoundError(`question ${id} not found`);

    const links = await db
      .select({ tagId: questionTagTable.tagId })
      .from(questionTagTable)
      .where(eq(questionTagTable.questionId, id));

    return c.json({ tagIds: links.map((l) => l.tagId) });
  })
  .put('/:id/tag', zValidator('json', questionTagBodySchema), async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    const { tagIds } = c.req.valid('json');
    console.log(`PUT /api/question/${id}/tag tagIds=${tagIds.join(',')}`);

    const [found] = await db.select().from(questionTable).where(eq(questionTable.id, id));
    if (found === undefined) throw new NotFoundError(`question ${id} not found`);

    const tags = await validateTagsForSubject(db, found.subjectId, tagIds);

    await db.delete(questionTagTable).where(eq(questionTagTable.questionId, id));
    if (tags.length > 0)
      await db
        .insert(questionTagTable)
        .values(tags.map((tag) => ({ questionId: id, tagId: tag.id })));

    const links = await db
      .select({ tagId: questionTagTable.tagId })
      .from(questionTagTable)
      .where(eq(questionTagTable.questionId, id));
    return c.json({ tagIds: links.map((l) => l.tagId) });
  })
  .get('/:id/concept', async (c) => {
    const db = c.get('db');
    const id = Number(c.req.param('id'));
    console.log(`GET /api/question/${id}/concept`);

    const [found] = await db.select().from(questionTable).where(eq(questionTable.id, id));
    if (found === undefined) throw new NotFoundError(`question ${id} not found`);

    const links = await db
      .select({ conceptId: questionConceptTable.conceptId })
      .from(questionConceptTable)
      .where(eq(questionConceptTable.questionId, id));

    return c.json({ conceptIds: links.map((l) => l.conceptId) });
  })
  .put(
    '/:id/concept',
    zValidator('json', questionConceptBodySchema),
    async (c) => {
      const db = c.get('db');
      const id = Number(c.req.param('id'));
      const { conceptIds } = c.req.valid('json');
      console.log(`PUT /api/question/${id}/concept conceptIds=${conceptIds.join(',')}`);

      const [found] = await db.select().from(questionTable).where(eq(questionTable.id, id));
      if (found === undefined) throw new NotFoundError(`question ${id} not found`);

      const nextIdsSet = [...new Set(conceptIds)];
      await validateConceptsForSubject(db, found.subjectId, nextIdsSet);

      const currentLinks = await db
        .select({ conceptId: questionConceptTable.conceptId })
        .from(questionConceptTable)
        .where(eq(questionConceptTable.questionId, id));
      const currentIdsSet = new Set(currentLinks.map((l) => l.conceptId));
      const nextIds = new Set(nextIdsSet);

      // Keep each concept's numberOfQuestions accurate rather than just
      // replacing the link rows -- it feeds the adaptive question
      // selection algorithm's weighting, so a stale count after an edit
      // would quietly bias that.
      const added = nextIdsSet.filter((cid) => !currentIdsSet.has(cid));
      const removed = [...currentIdsSet].filter((cid) => !nextIds.has(cid));
      for (const conceptId of added)
        await db
          .update(conceptTable)
          .set({ numberOfQuestions: sql`${conceptTable.numberOfQuestions} + 1` })
          .where(eq(conceptTable.id, conceptId));
      for (const conceptId of removed)
        await db
          .update(conceptTable)
          .set({ numberOfQuestions: sql`${conceptTable.numberOfQuestions} - 1` })
          .where(eq(conceptTable.id, conceptId));

      await db.delete(questionConceptTable).where(eq(questionConceptTable.questionId, id));
      await db
        .insert(questionConceptTable)
        .values(nextIdsSet.map((conceptId) => ({ questionId: id, conceptId })));

      const links = await db
        .select({ conceptId: questionConceptTable.conceptId })
        .from(questionConceptTable)
        .where(eq(questionConceptTable.questionId, id));
      return c.json({ conceptIds: links.map((l) => l.conceptId) });
    }
  );
