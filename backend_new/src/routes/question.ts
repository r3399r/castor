import { zValidator } from '@hono/zod-validator';
import { and, asc, count, desc, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
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
} from 'src/db/schema';
import { enableFacebookEventBridge } from 'src/lib/facebookEventBridge';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT } from 'src/lib/paginator';
import { UserEnv } from 'src/middleware/requireUser';
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

export const questionCountQuerySchema = z.object({
  subjectId: z.coerce.number().int().positive(),
  examIds: z.string().optional(),
  conceptIds: z.string().optional(),
  tagIds: z.string().optional(),
});

// Exported for reuse by /reply, which resolves the same comma-joined
// exam/tag id lists to question-id sets for its own filtering.
export const parseIdList = (value: string | undefined) =>
  value ? value.split(',').map(Number) : [];

// A generous but bounded upper limit -- the legacy endpoint had no cap at
// all, but nothing in the app ever requests more than 10 at a time (the
// practice-page buttons are 1/2/5/10), so this just guards against a
// stray client request driving candidate-query sizes way up.
export const questionAdaptiveQuerySchema = z.object({
  subjectId: z.coerce.number().int().positive(),
  examIds: z.string().optional(),
  conceptIds: z.string().optional(),
  tagIds: z.string().optional(),
  count: z.coerce.number().int().positive().max(50).optional().default(1),
});

export type QuestionDetailChildDto = {
  id: number;
  type: string;
  sortOrder: number | null;
  content: string | null;
  options: string | null;
  answer: string | null;
  difficulty: number;
  adjustedDifficulty: number;
};

export type QuestionDetailDto = {
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
  exam: { id: number; name: string }[];
  tag: { id: number; name: string }[];
  concept: { id: number; name: string; conceptGroup: { id: number; name: string } }[];
  children: QuestionDetailChildDto[];
};

// Builds full nested DTOs only for the ids passed in -- the adaptive
// selection below deliberately keeps its candidate-scoring queries to
// just question.id, and only calls this once, for the small final set of
// chosen ids, rather than eager-loading every candidate it examines
// along the way. Exported for reuse by /reply, which needs the same
// nested exam/tag/concept shape for its history listing.
export const buildQuestionDtos = async (db: Db, ids: number[]) => {
  const dtoById = new Map<number, QuestionDetailDto>();
  if (ids.length === 0) return dtoById;

  const rows = await db.select().from(questionTable).where(inArray(questionTable.id, ids));
  const childRows = await db
    .select()
    .from(questionTable)
    .where(inArray(questionTable.parentId, ids))
    .orderBy(asc(questionTable.sortOrder));
  const examLinks = await db
    .select({ questionId: questionExamTable.questionId, id: examTable.id, name: examTable.name })
    .from(questionExamTable)
    .innerJoin(examTable, eq(examTable.id, questionExamTable.examId))
    .where(inArray(questionExamTable.questionId, ids));
  const tagLinks = await db
    .select({ questionId: questionTagTable.questionId, id: tagTable.id, name: tagTable.name })
    .from(questionTagTable)
    .innerJoin(tagTable, eq(tagTable.id, questionTagTable.tagId))
    .where(inArray(questionTagTable.questionId, ids));
  const conceptLinks = await db
    .select({
      questionId: questionConceptTable.questionId,
      id: conceptTable.id,
      name: conceptTable.name,
      conceptGroupId: conceptGroupTable.id,
      conceptGroupName: conceptGroupTable.name,
    })
    .from(questionConceptTable)
    .innerJoin(conceptTable, eq(conceptTable.id, questionConceptTable.conceptId))
    .innerJoin(conceptGroupTable, eq(conceptGroupTable.id, conceptTable.conceptGroupId))
    .where(inArray(questionConceptTable.questionId, ids));

  const childrenByParent = new Map<number, QuestionDetailChildDto[]>();
  for (const child of childRows) {
    const list = childrenByParent.get(child.parentId!) ?? [];
    list.push({
      id: child.id,
      type: child.type,
      sortOrder: child.sortOrder,
      content: child.content,
      options: child.options,
      answer: child.answer,
      difficulty: child.difficulty,
      adjustedDifficulty: child.adjustedDifficulty,
    });
    childrenByParent.set(child.parentId!, list);
  }
  const examsByQuestion = new Map<number, { id: number; name: string }[]>();
  for (const link of examLinks) {
    const list = examsByQuestion.get(link.questionId) ?? [];
    list.push({ id: link.id, name: link.name });
    examsByQuestion.set(link.questionId, list);
  }
  const tagsByQuestion = new Map<number, { id: number; name: string }[]>();
  for (const link of tagLinks) {
    const list = tagsByQuestion.get(link.questionId) ?? [];
    list.push({ id: link.id, name: link.name });
    tagsByQuestion.set(link.questionId, list);
  }
  const conceptsByQuestion = new Map<number, QuestionDetailDto['concept']>();
  for (const link of conceptLinks) {
    const list = conceptsByQuestion.get(link.questionId) ?? [];
    list.push({
      id: link.id,
      name: link.name,
      conceptGroup: { id: link.conceptGroupId, name: link.conceptGroupName },
    });
    conceptsByQuestion.set(link.questionId, list);
  }

  for (const row of rows)
    dtoById.set(row.id, {
      id: row.id,
      uuid: row.uuid,
      subjectId: row.subjectId,
      parentId: row.parentId,
      isGroup: row.isGroup,
      type: row.type,
      sortOrder: row.sortOrder,
      content: row.content,
      options: row.options,
      answer: row.answer,
      difficulty: row.difficulty,
      adjustedDifficulty: row.adjustedDifficulty,
      exam: examsByQuestion.get(row.id) ?? [],
      tag: tagsByQuestion.get(row.id) ?? [],
      concept: conceptsByQuestion.get(row.id) ?? [],
      children: childrenByParent.get(row.id) ?? [],
    });

  return dtoById;
};

// Removes and returns one random element from arr in O(1) -- swaps the
// picked slot with the last element instead of the naive
// Array.from(map.values())[randomIndex] + Map.delete approach (which
// rebuilds the whole array on every single pick).
const pickRandom = (arr: number[]) => {
  const index = Math.floor(Math.random() * arr.length);
  const picked = arr[index];
  arr[index] = arr[arr.length - 1];
  arr.pop();
  return picked;
};

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

export const question = new Hono<UserEnv>()
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
  .get('/count', zValidator('query', questionCountQuerySchema), async (c) => {
    const { subjectId, examIds, conceptIds, tagIds } = c.req.valid('query');
    console.log(
      `GET /api/question/count subjectId=${subjectId} examIds=${examIds ?? ''} conceptIds=${conceptIds ?? ''} tagIds=${tagIds ?? ''}`
    );
    const db = c.get('db');

    // Same shape as GET / -- top-level questions only.
    const conditions = [isNull(questionTable.parentId), eq(questionTable.subjectId, subjectId)];

    // Each filter is resolved to a question-id set first (rather than
    // joining the link tables directly), so a question matching multiple
    // exams/concepts/tags in the filter list is still only counted once.
    const examIdList = parseIdList(examIds);
    if (examIdList.length > 0) {
      const links = await db
        .select({ questionId: questionExamTable.questionId })
        .from(questionExamTable)
        .where(inArray(questionExamTable.examId, examIdList));
      conditions.push(inArray(questionTable.id, links.map((l) => l.questionId)));
    }

    const conceptIdList = parseIdList(conceptIds);
    if (conceptIdList.length > 0) {
      const links = await db
        .select({ questionId: questionConceptTable.questionId })
        .from(questionConceptTable)
        .where(inArray(questionConceptTable.conceptId, conceptIdList));
      conditions.push(inArray(questionTable.id, links.map((l) => l.questionId)));
    }

    const tagIdList = parseIdList(tagIds);
    if (tagIdList.length > 0) {
      const links = await db
        .select({ questionId: questionTagTable.questionId })
        .from(questionTagTable)
        .where(inArray(questionTagTable.tagId, tagIdList));
      conditions.push(inArray(questionTable.id, links.map((l) => l.questionId)));
    }

    const [{ total }] = await db
      .select({ total: count() })
      .from(questionTable)
      .where(and(...conditions));

    return c.json({ total });
  })
  .get('/adaptive', zValidator('query', questionAdaptiveQuerySchema), async (c) => {
    const { subjectId, examIds, conceptIds, tagIds, count: requiredCount } = c.req.valid('query');
    console.log(
      `GET /api/question/adaptive subjectId=${subjectId} examIds=${examIds ?? ''} conceptIds=${conceptIds ?? ''} tagIds=${tagIds ?? ''} count=${requiredCount}`
    );
    const db = c.get('db');
    const user = c.get('user');

    // Candidate concepts and their question counts. Explicit conceptIds
    // are honored even if a concept currently has zero questions (the
    // caller asked for it specifically); the auto-selected "every
    // concept in the subject" fallback skips empty ones, since including
    // them would only dilute every other concept's weightedTake below
    // for no benefit.
    const conceptWeights = new Map<number, number>();
    const conceptIdList = parseIdList(conceptIds);
    if (conceptIdList.length > 0) {
      const conceptIdsSet = [...new Set(conceptIdList)];
      const concepts = await db
        .select({
          id: conceptTable.id,
          numberOfQuestions: conceptTable.numberOfQuestions,
          subjectId: conceptGroupTable.subjectId,
        })
        .from(conceptTable)
        .innerJoin(conceptGroupTable, eq(conceptGroupTable.id, conceptTable.conceptGroupId))
        .where(inArray(conceptTable.id, conceptIdsSet));
      if (concepts.length !== conceptIdsSet.length)
        throw new BadRequestError('some concepts do not exist');
      for (const concept of concepts) {
        if (concept.subjectId !== subjectId)
          throw new BadRequestError('concept does not belong to the specified subject');
        conceptWeights.set(concept.id, concept.numberOfQuestions);
      }
    } else {
      const concepts = await db
        .select({ id: conceptTable.id, numberOfQuestions: conceptTable.numberOfQuestions })
        .from(conceptTable)
        .innerJoin(conceptGroupTable, eq(conceptGroupTable.id, conceptTable.conceptGroupId))
        .where(eq(conceptGroupTable.subjectId, subjectId));
      for (const concept of concepts)
        if (concept.numberOfQuestions > 0) conceptWeights.set(concept.id, concept.numberOfQuestions);
    }

    const totalQuestions = [...conceptWeights.values()].reduce((a, b) => a + b, 0);

    // Pending replies: questions already served to this user for this
    // subject that they haven't answered yet -- re-serving them fresh
    // would let a slow client end up with the "same" practice set
    // returning different questions each time it's fetched. Scoped to
    // subjectId at the query level via the join below, unlike the
    // legacy version, which fetched every pending reply for the user
    // across every subject and relied on the concept-membership check
    // further down to filter out the unrelated ones after the fact.
    const pendingReplies = await db
      .select({ questionId: pendingReplyTable.questionId })
      .from(pendingReplyTable)
      .innerJoin(questionTable, eq(questionTable.id, pendingReplyTable.questionId))
      .where(and(eq(pendingReplyTable.userId, user.id), eq(questionTable.subjectId, subjectId)))
      .orderBy(desc(pendingReplyTable.createdAt));
    const pendingQuestionIds = new Set(pendingReplies.map((p) => p.questionId));

    const matchedPendingIds: number[] = [];
    if (pendingReplies.length > 0) {
      const conceptLinks = await db
        .select({ questionId: questionConceptTable.questionId, conceptId: questionConceptTable.conceptId })
        .from(questionConceptTable)
        .where(inArray(questionConceptTable.questionId, [...pendingQuestionIds]));
      const conceptsByQuestion = new Map<number, number[]>();
      for (const link of conceptLinks) {
        const list = conceptsByQuestion.get(link.questionId) ?? [];
        list.push(link.conceptId);
        conceptsByQuestion.set(link.questionId, list);
      }
      for (const pending of pendingReplies) {
        const questionConcepts = conceptsByQuestion.get(pending.questionId) ?? [];
        if (questionConcepts.some((cid) => conceptWeights.has(cid)))
          matchedPendingIds.push(pending.questionId);
      }
    }

    const selectedIds: number[] = matchedPendingIds.slice(0, requiredCount);

    if (selectedIds.length < requiredCount && totalQuestions > 0) {
      // Recently-answered questions (last 7 days) are deprioritized, not
      // excluded outright -- only used to top up the response if there
      // aren't enough fresh candidates.
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentReplies = await db
        .select({ questionId: replyTable.questionId, parentId: replyTable.parentId })
        .from(replyTable)
        .where(
          and(
            eq(replyTable.subjectId, subjectId),
            eq(replyTable.userId, user.id),
            gt(replyTable.createdAt, sevenDaysAgo)
          )
        );
      // A reply to a GROUP question's child is recorded against the
      // child's own id, with parentId pointing back at the group -- roll
      // it up to the group id here since that's the unit adaptive
      // selection actually serves.
      const recentQuestionIds = new Set(recentReplies.map((r) => r.parentId ?? r.questionId));

      const baseCandidateTake = conceptWeights.size * (5 + Math.ceil(recentQuestionIds.size / 2));

      // Precomputed once rather than per concept (the legacy version
      // re-ran an equivalent lookup inside its per-concept loop even
      // though neither depends on which concept is being scored).
      let examQuestionIds: Set<number> | null = null;
      const examIdList = parseIdList(examIds);
      if (examIdList.length > 0) {
        const rows = await db
          .select({ questionId: questionExamTable.questionId })
          .from(questionExamTable)
          .where(inArray(questionExamTable.examId, examIdList));
        examQuestionIds = new Set(rows.map((r) => r.questionId));
      }
      let tagQuestionIds: Set<number> | null = null;
      const tagIdList = parseIdList(tagIds);
      if (tagIdList.length > 0) {
        const rows = await db
          .select({ questionId: questionTagTable.questionId })
          .from(questionTagTable)
          .where(inArray(questionTagTable.tagId, tagIdList));
        tagQuestionIds = new Set(rows.map((r) => r.questionId));
      }

      // Also batched once across every candidate concept instead of one
      // query per concept.
      const conceptIdsList = [...conceptWeights.keys()];
      const masteryRows = await db
        .select({ conceptId: userConceptStatTable.conceptId, mastery: userConceptStatTable.mastery })
        .from(userConceptStatTable)
        .where(
          and(eq(userConceptStatTable.userId, user.id), inArray(userConceptStatTable.conceptId, conceptIdsList))
        );
      const masteryByConcept = new Map(masteryRows.map((r) => [r.conceptId, r.mastery ?? 0]));
      const conceptLinkRows = await db
        .select({ conceptId: questionConceptTable.conceptId, questionId: questionConceptTable.questionId })
        .from(questionConceptTable)
        .where(inArray(questionConceptTable.conceptId, conceptIdsList));
      const questionIdsByConcept = new Map<number, number[]>();
      for (const link of conceptLinkRows) {
        const list = questionIdsByConcept.get(link.conceptId) ?? [];
        list.push(link.questionId);
        questionIdsByConcept.set(link.conceptId, list);
      }

      const candidateIds = new Set<number>();
      const recentCandidateIds = new Set<number>();

      // The two per-direction queries below (adjustedDifficulty <=
      // mastery vs > mastery) still run once per concept -- take (LIMIT)
      // and the candidate id set both vary per concept, so unlike the
      // lookups above there's no way to batch these into one query
      // without a per-partition LIMIT, which MySQL doesn't support.
      for (const [conceptId, numberOfQuestions] of conceptWeights) {
        let allowedIds = questionIdsByConcept.get(conceptId) ?? [];
        if (examQuestionIds) allowedIds = allowedIds.filter((id) => examQuestionIds!.has(id));
        if (tagQuestionIds) allowedIds = allowedIds.filter((id) => tagQuestionIds!.has(id));
        if (allowedIds.length === 0) continue;

        const mastery = masteryByConcept.get(conceptId) ?? 0;
        // This concept's share of the total candidate pool, scaled by
        // baseCandidateTake. The legacy version's equivalent line was
        // `baseCandidateTake * (conceptIds.get(conceptId) ?? 1 /
        // totalQuestions)` -- since .get(conceptId) is always defined
        // for a key drawn from the same map, the `?? 1 / totalQuestions`
        // branch could never actually run, so it multiplied by the
        // concept's raw, un-normalized question count instead of its
        // fraction of the total. Normalizing here fixes that.
        const weightedTake = Math.max(1, Math.ceil(baseCandidateTake * (numberOfQuestions / totalQuestions)));

        const baseConditions = [
          isNull(questionTable.parentId),
          eq(questionTable.subjectId, subjectId),
          inArray(questionTable.id, allowedIds),
        ];
        const lessRows = await db
          .select({ id: questionTable.id })
          .from(questionTable)
          .where(and(...baseConditions, lte(questionTable.adjustedDifficulty, mastery)))
          .orderBy(desc(questionTable.adjustedDifficulty))
          .limit(weightedTake);
        const greaterRows = await db
          .select({ id: questionTable.id })
          .from(questionTable)
          .where(and(...baseConditions, gt(questionTable.adjustedDifficulty, mastery)))
          .orderBy(asc(questionTable.adjustedDifficulty))
          .limit(weightedTake);

        for (const { id } of [...lessRows, ...greaterRows]) {
          if (pendingQuestionIds.has(id)) continue;
          if (recentQuestionIds.has(id)) recentCandidateIds.add(id);
          else candidateIds.add(id);
        }
      }

      const candidatePool = [...candidateIds];
      const recentPool = [...recentCandidateIds];
      while (selectedIds.length < requiredCount && candidatePool.length > 0)
        selectedIds.push(pickRandom(candidatePool));
      while (selectedIds.length < requiredCount && recentPool.length > 0)
        selectedIds.push(pickRandom(recentPool));
    }

    // Mark every newly-chosen question as pending so a second fetch
    // before the reply lands doesn't hand out a different question for
    // work already in flight (the matched-pending ones are already
    // marked, from a previous call).
    const newPendingIds = selectedIds.filter((id) => !pendingQuestionIds.has(id));
    if (newPendingIds.length > 0) {
      const now = new Date();
      await db
        .insert(pendingReplyTable)
        .values(newPendingIds.map((questionId) => ({ questionId, userId: user.id, createdAt: now, updatedAt: now })));
    }

    const dtoById = await buildQuestionDtos(db, selectedIds);
    return c.json(selectedIds.map((id) => dtoById.get(id)!));
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

    // Arms the Facebook auto-post polling rule (it disarms itself once it
    // runs out of unposted questions) -- once per batch rather than once
    // per question, since re-enabling an already-enabled rule is a no-op
    // anyway.
    await enableFacebookEventBridge();

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
