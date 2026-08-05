import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  conceptGroupTable,
  conceptTable,
  pendingReplyTable,
  questionConceptTable,
  questionExamTable,
  questionTable,
  questionTagTable,
  replyTable,
  subjectCategoryTable,
  subjectTable,
  userConceptStatTable,
  userStatHistoryTable,
  userWrongQuestionTable,
} from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT } from 'src/lib/paginator';
import { buildQuestionDtos, parseIdList, QuestionDetailDto } from 'src/routes/question';
import { UserEnv } from 'src/middleware/requireUser';
import { TransactionEnv } from 'src/middleware/transaction';

type Db = TransactionEnv['Variables']['db'];

const replyItemSchema = z.object({
  questionId: z.number().int().positive(),
  repliedAnswer: z.string(),
  durationMs: z.number().int().nonnegative().optional(),
});

export const replyBodySchema = z.array(replyItemSchema).min(1);

export const replyListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
  categoryId: z.coerce.number().int().positive().optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  examIds: z.string().optional(),
  tagIds: z.string().optional(),
});

// TRUE_FALSE and SINGLE were two identical exact-match functions in the
// legacy version -- merged here since there was never any behavioral
// difference between them.
const calcExactMatchScore = (replied: string, correct: string) => (replied === correct ? 10 : 0);

const calcMultipleScore = (replied: string, correct: string) => {
  let incorrectCount = 0;
  for (let i = 0; i < correct.length; i++) if (replied.at(i) !== correct.at(i)) incorrectCount++;

  const score = ((correct.length - 2 * incorrectCount) / correct.length) * 10;
  return score < 0 ? 0 : score;
};

const calcFillScore = (replied: string, correct: string) => {
  for (let i = 0; i < correct.length; i++) if (replied.at(i) !== correct.at(i)) return 0;
  return 10;
};

const calcScore = (type: string, replied: string, correct: string) => {
  switch (type) {
    case 'TRUE_FALSE':
    case 'SINGLE':
      return calcExactMatchScore(replied, correct);
    case 'MULTIPLE':
      return calcMultipleScore(replied, correct);
    case 'FILL':
      return calcFillScore(replied, correct);
    default:
      return 0;
  }
};

// Concept mastery is an exponentially-decayed blend of three signals:
// accuracy (lifetime), recent performance (decayed toward recent
// attempts), and exposure (how many attempts have accumulated at all,
// saturating at 20). Must run sequentially per concept -- if the same
// concept is touched twice in one batch (two questions on the same
// concept answered together), the second update needs to see the
// first's effect, not race it.
const upsertConceptStat = async (db: Db, userId: number, conceptId: number, score: number) => {
  const [existing] = await db
    .select()
    .from(userConceptStatTable)
    .where(and(eq(userConceptStatTable.userId, userId), eq(userConceptStatTable.conceptId, conceptId)));
  const now = new Date();

  if (existing) {
    const deltaDays = existing.lastAttemptAt
      ? Math.floor((now.getTime() - existing.lastAttemptAt.getTime()) / (24 * 60 * 60 * 1000))
      : 0;
    const decayFactor = Math.exp(-deltaDays / 7);

    const attemptCount = existing.attemptCount + 1;
    const scoringTotal = existing.scoringTotal + score;
    const weightedSum = existing.weightedSum * decayFactor + score;
    const decaySum = existing.decaySum * decayFactor + 1;

    const accuracy = scoringTotal / attemptCount;
    const recentPerformance = weightedSum / decaySum;
    const exposure = attemptCount >= 20 ? 10 : (10 * Math.log10(attemptCount + 1)) / Math.log10(21);
    const mastery = 0.5 * accuracy + 0.3 * recentPerformance + 0.2 * exposure;

    await db
      .update(userConceptStatTable)
      .set({ attemptCount, scoringTotal, lastAttemptAt: now, weightedSum, decaySum, mastery, updatedAt: now })
      .where(eq(userConceptStatTable.id, existing.id));
  } else {
    const exposure = (10 * Math.log10(2)) / Math.log10(21);
    const mastery = 0.5 * score + 0.3 * score + 0.2 * exposure;

    await db.insert(userConceptStatTable).values({
      userId,
      conceptId,
      attemptCount: 1,
      scoringTotal: score,
      lastAttemptAt: now,
      weightedSum: score,
      decaySum: 1,
      mastery,
      createdAt: now,
      updatedAt: now,
    });
  }
};

// Daily rollup per (user, subject): weightedMastery is recomputed fresh
// from every concept_stat row the user has in this subject (not just the
// concepts touched by this batch), weighted by each concept's
// numberOfQuestions -- same query shape as UserConceptStatAccess's
// findByUserAndSubject in the legacy version.
const upsertStatHistory = async (
  db: Db,
  userId: number,
  subjectId: number,
  batchAttempts: number,
  batchScore: number
) => {
  const today = new Date().toISOString().slice(0, 10);

  const stats = await db
    .select({ mastery: userConceptStatTable.mastery, numberOfQuestions: conceptTable.numberOfQuestions })
    .from(userConceptStatTable)
    .innerJoin(conceptTable, eq(conceptTable.id, userConceptStatTable.conceptId))
    .innerJoin(conceptGroupTable, eq(conceptGroupTable.id, conceptTable.conceptGroupId))
    .where(and(eq(userConceptStatTable.userId, userId), eq(conceptGroupTable.subjectId, subjectId)));
  const totalQuestions = stats.reduce((sum, s) => sum + s.numberOfQuestions, 0);
  const weightedMastery =
    totalQuestions > 0
      ? stats.reduce((sum, s) => sum + (s.mastery ?? 0) * s.numberOfQuestions, 0) / totalQuestions
      : null;

  const [existing] = await db
    .select()
    .from(userStatHistoryTable)
    .where(
      and(
        eq(userStatHistoryTable.userId, userId),
        eq(userStatHistoryTable.subjectId, subjectId),
        eq(userStatHistoryTable.date, today)
      )
    );
  const now = new Date();

  if (existing) {
    await db
      .update(userStatHistoryTable)
      .set({
        weightedMastery,
        dailyAttempts: existing.dailyAttempts + batchAttempts,
        dailyCorrect: existing.dailyCorrect + batchScore,
        updatedAt: now,
      })
      .where(eq(userStatHistoryTable.id, existing.id));
  } else {
    await db.insert(userStatHistoryTable).values({
      userId,
      subjectId,
      date: today,
      weightedMastery,
      dailyAttempts: batchAttempts,
      dailyCorrect: batchScore,
      createdAt: now,
      updatedAt: now,
    });
  }
};

// Auto-added the first time a question scores below 10. A later wrong
// attempt at the same question updates score/wrongCount/lastWrongAt in
// place (matches user_wrong_question's UNIQUE KEY on (userId,
// questionId): there's never more than one row to update) so the row
// always reflects the most recent wrong answer -- but a later *correct*
// answer never calls this at all (see the call site's `score < 10`
// guard), so it can't reset or delete anything here. note and createdAt
// are the only fields this never touches; removing an entry, or
// attaching a note to it, is only ever done by the user via
// wrongQuestion.ts.
const upsertWrongQuestion = async (
  db: Db,
  userId: number,
  questionId: number,
  parentId: number | null,
  subjectId: number,
  score: number,
  wrongAt: Date
) => {
  const [existing] = await db
    .select({ id: userWrongQuestionTable.id, wrongCount: userWrongQuestionTable.wrongCount })
    .from(userWrongQuestionTable)
    .where(and(eq(userWrongQuestionTable.userId, userId), eq(userWrongQuestionTable.questionId, questionId)));

  if (existing) {
    await db
      .update(userWrongQuestionTable)
      .set({ score, wrongCount: existing.wrongCount + 1, lastWrongAt: wrongAt, updatedAt: wrongAt })
      .where(eq(userWrongQuestionTable.id, existing.id));
    return;
  }

  await db.insert(userWrongQuestionTable).values({
    userId,
    questionId,
    parentId,
    subjectId,
    score,
    wrongCount: 1,
    lastWrongAt: wrongAt,
    createdAt: wrongAt,
    updatedAt: wrongAt,
  });
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

export const reply = new Hono<UserEnv>()
  .post('/', zValidator('json', replyBodySchema), async (c) => {
    const items = c.req.valid('json');
    const user = c.get('user');
    const db = c.get('db');
    console.log(`POST /api/reply userId=${user.id} count=${items.length}`);

    const questionIds = [...new Set(items.map((i) => i.questionId))];
    const questions = await db.select().from(questionTable).where(inArray(questionTable.id, questionIds));
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    const parentIds = [...new Set(questions.flatMap((q) => (q.parentId ? [q.parentId] : [])))];
    if (parentIds.length > 0) {
      const parents = await db.select().from(questionTable).where(inArray(questionTable.id, parentIds));
      for (const parent of parents) questionMap.set(parent.id, parent);
    }

    // Concept links for every question and parent involved, fetched once
    // rather than per item.
    const conceptLinks = await db
      .select({ questionId: questionConceptTable.questionId, conceptId: questionConceptTable.conceptId })
      .from(questionConceptTable)
      .where(inArray(questionConceptTable.questionId, [...questionMap.keys()]));
    const conceptIdsByQuestion = new Map<number, number[]>();
    for (const link of conceptLinks) {
      const list = conceptIdsByQuestion.get(link.questionId) ?? [];
      list.push(link.conceptId);
      conceptIdsByQuestion.set(link.questionId, list);
    }

    // Answering a question means it's no longer "in flight" -- clear any
    // pending_reply rows for whichever of these questions the user had
    // pending (bulk delete, rather than the legacy version's per-row
    // find-then-delete loop).
    const pendingRows = await db
      .select({ id: pendingReplyTable.id, questionId: pendingReplyTable.questionId })
      .from(pendingReplyTable)
      .where(eq(pendingReplyTable.userId, user.id));
    const clearedPendingIds = pendingRows
      .filter((p) => questionMap.has(p.questionId))
      .map((p) => p.id);
    if (clearedPendingIds.length > 0)
      await db.delete(pendingReplyTable).where(inArray(pendingReplyTable.id, clearedPendingIds));

    const repliedAt = new Date();
    const responses: {
      questionId: number;
      repliedAnswer: string;
      correctAnswer: string;
      score: number;
      fbPostId: string | null;
    }[] = [];
    const replyRows: (typeof replyTable.$inferInsert)[] = [];
    // Keyed by subjectId -- "correct" mirrors the legacy field name
    // (dailyCorrect), but it's actually the sum of scores (0-10 each),
    // not a count of correct answers.
    const subjectBatch = new Map<number, { attempts: number; correct: number }>();

    for (const item of items) {
      const question = questionMap.get(item.questionId);
      if (!question) continue;
      const parentQuestion = question.parentId ? questionMap.get(question.parentId) ?? null : null;

      const score = calcScore(question.type, item.repliedAnswer, question.answer ?? '');

      // Mutated in-memory and persisted once after the loop below (rather
      // than awaiting a write per item) -- if the same question appears
      // twice in one batch (a malformed request; the frontend never does
      // this), later iterations still see the running total via this
      // object, and only the final value gets written.
      question.attempCount += 1;
      question.scoringTotal += score;
      question.durationTotalMs += item.durationMs ?? 0;
      const weight = Math.min(1, question.attempCount / 1068);
      question.adjustedDifficulty =
        weight * (10 - question.scoringTotal / question.attempCount) + (1 - weight) * question.difficulty;

      responses.push({
        questionId: question.id,
        repliedAnswer: item.repliedAnswer,
        correctAnswer: question.answer ?? '',
        score,
        fbPostId: parentQuestion ? parentQuestion.fbPostId : question.fbPostId,
      });
      replyRows.push({
        questionId: question.id,
        subjectId: question.subjectId,
        userId: user.id,
        parentId: parentQuestion ? parentQuestion.id : null,
        score,
        repliedAnswer: item.repliedAnswer,
        durationMs: item.durationMs ?? null,
        repliedAt,
        createdAt: repliedAt,
        updatedAt: repliedAt,
      });

      const conceptIds = new Set<number>(conceptIdsByQuestion.get(question.id) ?? []);
      if (parentQuestion)
        for (const conceptId of conceptIdsByQuestion.get(parentQuestion.id) ?? []) conceptIds.add(conceptId);
      for (const conceptId of conceptIds) await upsertConceptStat(db, user.id, conceptId, score);

      if (score < 10)
        await upsertWrongQuestion(
          db,
          user.id,
          question.id,
          parentQuestion ? parentQuestion.id : null,
          question.subjectId,
          score,
          repliedAt
        );

      const entry = subjectBatch.get(question.subjectId) ?? { attempts: 0, correct: 0 };
      entry.attempts += 1;
      entry.correct += score;
      subjectBatch.set(question.subjectId, entry);
    }

    const touchedQuestionIds = new Set(items.map((i) => i.questionId).filter((id) => questionMap.has(id)));
    for (const id of touchedQuestionIds) {
      const q = questionMap.get(id)!;
      await db
        .update(questionTable)
        .set({
          attempCount: q.attempCount,
          scoringTotal: q.scoringTotal,
          durationTotalMs: q.durationTotalMs,
          adjustedDifficulty: q.adjustedDifficulty,
          updatedAt: repliedAt,
        })
        .where(eq(questionTable.id, id));
    }

    if (replyRows.length > 0) await db.insert(replyTable).values(replyRows);

    // A GROUP question's own adjustedDifficulty is the average of its
    // children's -- recomputed fresh from the DB (which now reflects the
    // writes above) since a batch might only answer some of a group's
    // children, not all of them.
    for (const parentId of parentIds) {
      const children = await db
        .select({ adjustedDifficulty: questionTable.adjustedDifficulty })
        .from(questionTable)
        .where(eq(questionTable.parentId, parentId));
      if (children.length === 0) continue;
      const avg = children.reduce((sum, c) => sum + c.adjustedDifficulty, 0) / children.length;
      await db.update(questionTable).set({ adjustedDifficulty: avg, updatedAt: repliedAt }).where(eq(questionTable.id, parentId));
    }

    for (const [subjectId, { attempts, correct }] of subjectBatch)
      await upsertStatHistory(db, user.id, subjectId, attempts, correct);

    return c.json(responses);
  })
  .get('/', zValidator('query', replyListQuerySchema), async (c) => {
    const { limit, offset, categoryId, subjectId, examIds, tagIds } = c.req.valid('query');
    const user = c.get('user');
    const db = c.get('db');
    console.log(
      `GET /api/reply userId=${user.id} limit=${limit} offset=${offset} categoryId=${categoryId ?? ''} subjectId=${subjectId ?? ''} examIds=${examIds ?? ''} tagIds=${tagIds ?? ''}`
    );

    // A "history row" is one submitted batch's worth of replies to the
    // same group question -- standalone questions group by their own id,
    // a GROUP question's children all group under its parentId. Every
    // reply from the same POST /reply call shares the same repliedAt, so
    // (repliedAt, groupKey) uniquely identifies one row.
    const groupKey = sql<number>`coalesce(${replyTable.parentId}, ${replyTable.questionId})`;
    // Every filter below applies to every query further down (the group
    // listing, the total count, and the final row fetch), same as the
    // legacy onlyWrong condition did -- so a page's rows and its total
    // always agree.
    const userConditions = [eq(replyTable.userId, user.id)];
    if (subjectId !== undefined) userConditions.push(eq(replyTable.subjectId, subjectId));

    // Resolved to a subject-id set (rather than joining subject_category
    // directly) so a subject linked to the category more than once -- not
    // possible given the composite PK, but keeps this the same shape as
    // every other filter here -- is still only counted once. inArray([])
    // safely compiles to `false` (drizzle-orm), so an unknown/empty
    // category just yields zero rows rather than an SQL error.
    if (categoryId !== undefined) {
      const links = await db
        .select({ subjectId: subjectCategoryTable.subjectId })
        .from(subjectCategoryTable)
        .where(eq(subjectCategoryTable.categoryId, categoryId));
      userConditions.push(inArray(replyTable.subjectId, links.map((l) => l.subjectId)));
    }

    // exam/tag links only ever exist on a question's top-level (parentless)
    // row -- a GROUP question's children never get their own -- so matches
    // are resolved against groupKey (the row's top-level question id)
    // rather than replyTable.questionId directly. This mirrors
    // question/count's per-filter id-set resolution in question.ts.
    const examIdList = parseIdList(examIds);
    if (examIdList.length > 0) {
      const links = await db
        .select({ questionId: questionExamTable.questionId })
        .from(questionExamTable)
        .where(inArray(questionExamTable.examId, examIdList));
      userConditions.push(inArray(groupKey, links.map((l) => l.questionId)));
    }

    const tagIdList = parseIdList(tagIds);
    if (tagIdList.length > 0) {
      const links = await db
        .select({ questionId: questionTagTable.questionId })
        .from(questionTagTable)
        .where(inArray(questionTagTable.tagId, tagIdList));
      userConditions.push(inArray(groupKey, links.map((l) => l.questionId)));
    }

    const groupRows = await db
      .select({ repliedAt: replyTable.repliedAt, groupKey })
      .from(replyTable)
      .where(and(...userConditions))
      .groupBy(replyTable.repliedAt, groupKey)
      .orderBy(desc(replyTable.repliedAt))
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({
        total: sql<number>`count(distinct ${replyTable.repliedAt}, coalesce(${replyTable.parentId}, ${replyTable.questionId}))`,
      })
      .from(replyTable)
      .where(and(...userConditions));

    if (groupRows.length === 0) return c.json({ data: [], paginate: genPagination(total, limit, offset) });

    const repliedAtByTime = new Map(groupRows.map((r) => [r.repliedAt.getTime(), r.repliedAt]));
    const rows = await db
      .select()
      .from(replyTable)
      .where(and(...userConditions, inArray(replyTable.repliedAt, [...repliedAtByTime.values()])))
      .orderBy(desc(replyTable.repliedAt));

    // Preserves this page's group order/membership -- the repliedAt IN
    // query above can also pull in rows from a different group that
    // happens to share a repliedAt timestamp with one on this page (two
    // unrelated batches submitted in the same millisecond); the lookup
    // below excludes anything not in groupRows.
    const pageOrder = new Map(groupRows.map((r, i) => [`${r.repliedAt.getTime()}|${r.groupKey}`, i]));

    const questionIds = [...new Set(rows.flatMap((r) => [r.questionId, ...(r.parentId ? [r.parentId] : [])]))];
    const subjectIds = [...new Set(rows.map((r) => r.subjectId))];
    const [questionDtoById, subjects] = await Promise.all([
      buildQuestionDtos(db, questionIds),
      db.select({ id: subjectTable.id, name: subjectTable.name }).from(subjectTable).where(inArray(subjectTable.id, subjectIds)),
    ]);
    const subjectById = new Map(subjects.map((s) => [s.id, s]));

    const groupMap = new Map<string, ReplyGroupDto>();
    for (const row of rows) {
      const key = row.parentId ?? row.questionId;
      const compositeKey = `${row.repliedAt.getTime()}|${key}`;
      if (!pageOrder.has(compositeKey)) continue;

      if (!groupMap.has(compositeKey)) {
        const parentQuestion = row.parentId ? questionDtoById.get(row.parentId) ?? null : null;
        const subject = subjectById.get(row.subjectId);
        groupMap.set(compositeKey, {
          repliedAt: row.repliedAt.toISOString(),
          parentQuestion,
          subject: subject ?? { id: row.subjectId, name: '' },
          subjectId: row.subjectId,
          children: [],
        });
      }

      const question = questionDtoById.get(row.questionId);
      if (!question) continue;
      groupMap.get(compositeKey)!.children.push({
        id: row.id,
        questionId: row.questionId,
        question,
        parentId: row.parentId,
        score: row.score,
        repliedAnswer: row.repliedAnswer,
        createdAt: row.createdAt?.toISOString() ?? null,
      });
    }

    const data = [...groupMap.entries()]
      .sort(([a], [b]) => (pageOrder.get(a) ?? 0) - (pageOrder.get(b) ?? 0))
      .map(([, group]) => group);

    return c.json({ data, paginate: genPagination(total, limit, offset) });
  });
