import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  conceptGroupTable,
  conceptTable,
  durationGlobalStatTable,
  pendingReplyTable,
  pointTransactionTable,
  questionConceptTable,
  questionExamTable,
  questionTable,
  questionTagTable,
  replyTable,
  subjectCategoryTable,
  subjectTable,
  userConceptStatTable,
  userStatHistoryTable,
  userTable,
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

// Points reward the *gap* between a question's difficulty and the
// user's mastery at the concepts it covers, not the raw score --
// answering something far above your current level is worth more than
// something far below it. Elo-style expected-score formula: E is the
// "expected probability of success" given that gap, scaled by
// POINTS_MASTERY_SCALE (mastery/difficulty both live on a 0-10 scale
// here, unlike chess's 0-2400 ratings, hence the much smaller constant).
// POINTS_BASE is the result at E=0.5 (mastery == difficulty, a fair coin
// flip), rising to 2x for a near-impossible win and falling toward 0 for
// a near-certain one. No penalty for wrong answers -- score already
// carries that signal, and points just scale by score/10, so score=0
// naturally yields 0 points without a separate branch. Deliberately
// unrounded -- this is the base value time-weight (below) still has to
// multiply; awardedPoints only rounds once, after that.
const POINTS_BASE = 100;
const POINTS_MASTERY_SCALE = 2.5;
const calcBasePoints = (questionMastery: number, adjustedDifficulty: number, score: number): number => {
  const gap = questionMastery - adjustedDifficulty;
  const expected = 1 / (1 + Math.pow(10, -gap / POINTS_MASTERY_SCALE));
  return POINTS_BASE * 2 * (1 - expected) * (score / 10);
};

// Time weight rewards questions/subjects that inherently take longer to
// answer, so a slow-but-equally-"difficulty 5"-rated math question isn't
// worth the same as a quick vocab one. Two independently-clamped layers,
// multiplied together rather than compared as one combined ratio -- a
// single flat ratio would let a subject far from the platform average
// swallow up all its individual questions' clamped range, flattening the
// within-subject differentiation the question-level layer exists for.
//   withinSubjectRatio: this question vs typical for its own subject.
//   subjectMultiplier: this subject vs the platform-wide typical.
// Any missing/insufficient-sample input (NULL from questionStat.ts, or no
// duration_global_stat row yet) falls back to neutral (1.0) for that
// layer -- untrusted data should never distort the reward, only trusted
// data should. Bounds intentionally asymmetric: the question-level clamp
// (0.5~2.0) is a meaningful behavioral range that actually gets hit; the
// subject-level clamp (0.1~10) is deliberately wide -- a pure safety net
// against corrupted data, not a shaping constraint -- because a tight
// subject-level clamp breaks "same points-per-hour regardless of which
// subject you practice" (the ratio is throughput-neutral by construction
// when unclamped: more questions-per-hour at a proportionally lower
// per-question weight exactly cancels out).
const WITHIN_SUBJECT_CLAMP: [number, number] = [0.5, 2.0];
const SUBJECT_MULTIPLIER_CLAMP: [number, number] = [0.1, 10];
const clamp = (value: number, [min, max]: [number, number]): number => Math.min(max, Math.max(min, value));

const calcTimeWeight = (
  questionMedianMs: number | null,
  subjectMedianMs: number | null,
  globalMedianMs: number | null
): number => {
  const withinSubjectRatio =
    questionMedianMs != null && subjectMedianMs != null
      ? clamp(questionMedianMs / subjectMedianMs, WITHIN_SUBJECT_CLAMP)
      : 1.0;
  const subjectMultiplier =
    subjectMedianMs != null && globalMedianMs != null
      ? clamp(subjectMedianMs / globalMedianMs, SUBJECT_MULTIPLIER_CLAMP)
      : 1.0;
  return withinSubjectRatio * subjectMultiplier;
};

// Anti-farming: an answer given faster than 80% of this question's own
// typical (5th-percentile) response time reads as a reflexive/uninformed
// guess rather than a real attempt, so it earns no points -- MIN_ANSWER_MS
// is an absolute floor on top of that, since a brand-new question has no
// duration_p5_ms data yet (durationP5Ms null falls back to just this flat
// floor). Only zeroes the reward; scoring, mastery, and wrong-question
// tracking all still happen normally -- a wrong answer was never
// penalized to begin with, this just denies farming easy correct ones.
// durationMs missing entirely (an older/other caller) isn't treated as
// suspicious -- there's nothing to compare against.
const MIN_ANSWER_MS = 2000;
const FAST_ANSWER_P5_RATIO = 0.8;
const isTooFastForPoints = (durationP5Ms: number | null, durationMs: number | undefined): boolean => {
  if (durationMs === undefined) return false;
  const threshold = Math.max((durationP5Ms ?? 0) * FAST_ANSWER_P5_RATIO, MIN_ANSWER_MS);
  return durationMs < threshold;
};

// Concept mastery is an exponentially-decayed blend of three signals:
// accuracy (lifetime), recent performance (decayed toward recent
// attempts), and exposure (how many attempts have accumulated at all,
// saturating at 20). Must run sequentially per concept -- if the same
// concept is touched twice in one batch (two questions on the same
// concept answered together), the second update needs to see the
// first's effect, not race it. Returns the newly computed mastery so
// the points calculation's in-memory mastery snapshot (masteryByConcept
// in the POST handler below) can stay consistent within one batch too.
const upsertConceptStat = async (db: Db, userId: number, conceptId: number, score: number): Promise<number> => {
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
    return mastery;
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
    return mastery;
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
  batchScore: number,
  batchPoints: number
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
        dailyPoints: existing.dailyPoints + batchPoints,
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
      dailyPoints: batchPoints,
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

    // Mastery snapshot and per-concept weights for the points calculation
    // below -- fetched once before the loop mutates anything, so every
    // item's reward reflects skill *going into* this batch, not skill
    // updated by an earlier item in the same batch (masteryByConcept is
    // still kept in sync as upsertConceptStat runs per item, so a concept
    // touched twice in one batch behaves consistently with the mastery
    // table it's read from).
    const allConceptIds = [...new Set(conceptLinks.map((l) => l.conceptId))];
    const conceptWeightRows = await db
      .select({ id: conceptTable.id, numberOfQuestions: conceptTable.numberOfQuestions })
      .from(conceptTable)
      .where(inArray(conceptTable.id, allConceptIds));
    const numberOfQuestionsByConcept = new Map(conceptWeightRows.map((c) => [c.id, c.numberOfQuestions]));
    const masteryRows = await db
      .select({ conceptId: userConceptStatTable.conceptId, mastery: userConceptStatTable.mastery })
      .from(userConceptStatTable)
      .where(and(eq(userConceptStatTable.userId, user.id), inArray(userConceptStatTable.conceptId, allConceptIds)));
    const masteryByConcept = new Map(masteryRows.map((r) => [r.conceptId, r.mastery]));

    // Cold start: a concept with no user_concept_stat row yet falls back
    // to this question's own adjustedDifficulty (gap = 0, expected = 0.5)
    // rather than 0 -- defaulting to 0 would fabricate a huge fake gap
    // and wildly inflate a brand-new user's very first points.
    const calcQuestionMastery = (conceptIds: Set<number>, adjustedDifficulty: number): number => {
      let weightedSum = 0;
      let totalWeight = 0;
      for (const conceptId of conceptIds) {
        const weight = numberOfQuestionsByConcept.get(conceptId) ?? 1;
        const mastery = masteryByConcept.get(conceptId) ?? adjustedDifficulty;
        weightedSum += mastery * weight;
        totalWeight += weight;
      }
      return totalWeight > 0 ? weightedSum / totalWeight : adjustedDifficulty;
    };

    // Time-weight inputs -- subject medians for every subject touched by
    // this batch, plus the single platform-wide anchor. Both are missing/
    // null-safe (calcTimeWeight falls back to neutral), covering both "no
    // duration_global_stat row yet" (brand new deployment) and "this
    // subject/question hasn't hit its minimum sample size yet"
    // (questionStat.ts leaves durationMedianMs NULL either way).
    const subjectIds = [...new Set(questions.map((q) => q.subjectId))];
    const subjectRows = await db
      .select({ id: subjectTable.id, durationMedianMs: subjectTable.durationMedianMs })
      .from(subjectTable)
      .where(inArray(subjectTable.id, subjectIds));
    const subjectMedianById = new Map(subjectRows.map((s) => [s.id, s.durationMedianMs]));
    const [globalStat] = await db.select({ medianMs: durationGlobalStatTable.medianMs }).from(durationGlobalStatTable);
    const globalMedianMs = globalStat?.medianMs ?? null;

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
      awardedPoints: number;
      fbPostId: string | null;
    }[] = [];
    const replyRows: (typeof replyTable.$inferInsert)[] = [];
    // Keyed by subjectId -- "correct" mirrors the legacy field name
    // (dailyCorrect), but it's actually the sum of scores (0-10 each),
    // not a count of correct answers.
    const subjectBatch = new Map<number, { attempts: number; correct: number; points: number }>();
    let userPointsBatch = 0;

    for (const item of items) {
      const question = questionMap.get(item.questionId);
      if (!question) continue;
      const parentQuestion = question.parentId ? questionMap.get(question.parentId) ?? null : null;

      const score = calcScore(question.type, item.repliedAnswer, question.answer ?? '');

      const conceptIds = new Set<number>(conceptIdsByQuestion.get(question.id) ?? []);
      if (parentQuestion)
        for (const conceptId of conceptIdsByQuestion.get(parentQuestion.id) ?? []) conceptIds.add(conceptId);

      // Snapshot mastery/difficulty as they stood going into this attempt
      // -- computed before question.adjustedDifficulty is nudged by this
      // same answer just below, so the reward reflects how hard the
      // question looked beforehand, not after this outcome already
      // adjusted it.
      const questionMastery = calcQuestionMastery(conceptIds, question.adjustedDifficulty);
      const timeWeight = calcTimeWeight(
        question.durationMedianMs,
        subjectMedianById.get(question.subjectId) ?? null,
        globalMedianMs
      );
      const tooFast = isTooFastForPoints(question.durationP5Ms, item.durationMs);
      const awardedPoints = tooFast
        ? 0
        : Math.round(calcBasePoints(questionMastery, question.adjustedDifficulty, score) * timeWeight);
      userPointsBatch += awardedPoints;

      // Mutated in-memory and persisted once after the loop below (rather
      // than awaiting a write per item) -- if the same question appears
      // twice in one batch (a malformed request; the frontend never does
      // this), later iterations still see the running total via this
      // object, and only the final value gets written.
      question.attempCount += 1;
      question.scoringTotal += score;
      const weight = Math.min(1, question.attempCount / 1068);
      question.adjustedDifficulty =
        weight * (10 - question.scoringTotal / question.attempCount) + (1 - weight) * question.difficulty;

      responses.push({
        questionId: question.id,
        repliedAnswer: item.repliedAnswer,
        correctAnswer: question.answer ?? '',
        score,
        awardedPoints,
        fbPostId: parentQuestion ? parentQuestion.fbPostId : question.fbPostId,
      });
      replyRows.push({
        questionId: question.id,
        subjectId: question.subjectId,
        userId: user.id,
        parentId: parentQuestion ? parentQuestion.id : null,
        score,
        awardedPoints,
        repliedAnswer: item.repliedAnswer,
        durationMs: item.durationMs ?? null,
        // Persisted (not just used to zero this reply's own points) so
        // questionStat.ts can exclude it from future duration_p5_ms/
        // duration_median_ms computations -- otherwise a flood of
        // sub-threshold-fast replies (each worth 0 points on its own)
        // would still drag those stats down, gradually lowering the very
        // threshold used to detect "too fast" and making the check
        // easier to beat over time.
        tooFast,
        repliedAt,
        createdAt: repliedAt,
        updatedAt: repliedAt,
      });

      for (const conceptId of conceptIds) {
        const newMastery = await upsertConceptStat(db, user.id, conceptId, score);
        masteryByConcept.set(conceptId, newMastery);
      }

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

      const entry = subjectBatch.get(question.subjectId) ?? { attempts: 0, correct: 0, points: 0 };
      entry.attempts += 1;
      entry.correct += score;
      entry.points += awardedPoints;
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
          adjustedDifficulty: q.adjustedDifficulty,
          updatedAt: repliedAt,
        })
        .where(eq(questionTable.id, id));
    }

    if (replyRows.length > 0) {
      const [{ insertId: firstReplyId }] = await db.insert(replyTable).values(replyRows);

      // A single multi-row INSERT gets a contiguous block of auto-increment
      // ids from InnoDB -- true even under the default interleaved lock
      // mode, since the row count is known upfront for a plain VALUES-list
      // insert -- so row i's id is always firstReplyId + i, in the same
      // order as replyRows, without a second round-trip to look them up.
      const now = new Date();
      const pointTransactionRows: (typeof pointTransactionTable.$inferInsert)[] = [];
      replyRows.forEach((row, i) => {
        const awarded = row.awardedPoints ?? 0;
        if (awarded <= 0) return;
        pointTransactionRows.push({
          userId: row.userId,
          type: 'EARN_REPLY',
          amount: awarded,
          replyId: firstReplyId + i,
          // Filled in below once the running total is known -- placeholder
          // here just to satisfy the insert type.
          balanceAfter: 0,
          createdAt: now,
        });
      });

      if (userPointsBatch > 0) {
        // Read-then-write rather than a locked SELECT ... FOR UPDATE: this
        // whole handler already runs inside one transaction (see
        // middleware/transaction.ts), and a single user is never expected
        // to have two POST /reply requests in flight at once (the frontend
        // submits one batch at a time) -- the same posture the rest of
        // this file already takes with question.attempCount, so
        // balanceAfter is a best-effort audit snapshot, not the source of
        // truth (userTable.totalPoints, updated atomically below, is).
        const [currentUser] = await db
          .select({ totalPoints: userTable.totalPoints })
          .from(userTable)
          .where(eq(userTable.id, user.id));
        let runningBalance = currentUser?.totalPoints ?? 0;
        for (const row of pointTransactionRows) {
          runningBalance += row.amount;
          row.balanceAfter = runningBalance;
        }

        await db
          .update(userTable)
          .set({
            totalPoints: sql`${userTable.totalPoints} + ${userPointsBatch}`,
            lifetimePoints: sql`${userTable.lifetimePoints} + ${userPointsBatch}`,
            updatedAt: repliedAt,
          })
          .where(eq(userTable.id, user.id));
      }

      if (pointTransactionRows.length > 0) await db.insert(pointTransactionTable).values(pointTransactionRows);
    }

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

    for (const [subjectId, { attempts, correct, points }] of subjectBatch)
      await upsertStatHistory(db, user.id, subjectId, attempts, correct, points);

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
