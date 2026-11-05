import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { Hono } from 'hono';
import {
  categoryTable,
  examTable,
  questionExamTable,
  questionTable,
  subjectTable,
  userTable,
} from 'src/db/schema';
import { SUBSCRIPTION_PLANS } from 'src/lib/subscriptionPlan';
import { TransactionEnv } from 'src/middleware/transaction';

// Sized for the landing page's card grid (three across on a wide screen,
// five rows inside a card) rather than exposed as query parameters: the
// endpoint exists to fill that one section, and a caller who could ask
// for a hundred subjects would be asking this to scan the whole catalog.
const POPULAR_SUBJECT_LIMIT = 3;
const POPULAR_EXAM_LIMIT = 5;

export const info = new Hono<TransactionEnv>()
  // Deliberately touches no table: this is the health check, and it has to
  // keep answering 200 while the database is unreachable. The transaction
  // middleware is therefore bound to /api/info/stats alone in app.ts, not
  // to /api/info/*, which would also catch this path.
  .get('/', (c) => c.json({ status: 'ok', time: new Date().toISOString() }))
  // The authoritative prices, and the reason the webapp holds no price
  // constants of its own: the amount shown on the pricing page has to be
  // the amount that gets signed into the ECPay order, and a visitor sees
  // that page before signing in -- so this lives here, in the public
  // group, rather than under /api/subscription where requireUser would
  // hide it from exactly the people deciding whether to pay.
  //
  // No database access, so it stays outside the transaction middleware
  // bound to /api/info/stats.
  .get('/plans', (c) => {
    console.log('GET /api/info/plans');

    return c.json(
      SUBSCRIPTION_PLANS.map(({ code, amount, periodType, frequency }) => ({
        code,
        amount,
        periodType,
        frequency,
      }))
    );
  })
  // Public and unauthenticated -- it only feeds the landing page's counter
  // bar, so it reports catalog sizes and nothing per-user.
  .get('/stats', async (c) => {
    console.log('GET /api/info/stats');
    const db = c.get('db');

    // Five sequential COUNT(*)s rather than one select of scalar
    // subqueries: they share this request's transaction, so the numbers
    // are still read from one consistent snapshot, and mysql2 can't
    // pipeline concurrent queries on a single connection anyway.
    const [{ total: categoryCount }] = await db
      .select({ total: count() })
      .from(categoryTable);
    const [{ total: subjectCount }] = await db
      .select({ total: count() })
      .from(subjectTable);
    const [{ total: examCount }] = await db
      .select({ total: count() })
      .from(examTable);

    // Same definition of "a question" as GET /api/question/count: the
    // top-level rows that are actually servable. A 題組's children aren't
    // counted separately (the parent is the one question a user is given),
    // and enabled only ever means anything on a top-level row.
    const [{ total: questionCount }] = await db
      .select({ total: count() })
      .from(questionTable)
      .where(and(isNull(questionTable.parentId), eq(questionTable.enabled, true)));

    const [{ total: userCount }] = await db
      .select({ total: count() })
      .from(userTable);

    return c.json({
      categoryCount,
      subjectCount,
      examCount,
      questionCount,
      userCount,
    });
  })
  // The most-attempted subjects, each with its most-attempted exams --
  // public and unauthenticated for the same reason as /stats: it feeds a
  // landing-page section a visitor sees before signing in, and it reports
  // only catalog-wide totals, never who did the attempting.
  //
  // "Attempts" means how many times a question was practised, which is not
  // the same as how many answers it drew. reply.ts increments
  // question.attemp_count on the question that was actually answered, and
  // for a 題組 that is always the child row -- the parent's own counter
  // stays at 0 forever. So every row is first rolled up onto its top-level
  // question and reduced with MAX, not SUM:
  //
  //   - MAX over a standalone question's single row is its own counter.
  //   - MAX over a 題組 is one sub-question's counter, and the frontend
  //     submits every child together (unanswered ones included), so they
  //     all hold the same number: that number is how many times the 題組
  //     was served.
  //
  // SUM would instead multiply a 題組 by its number of sub-questions, which
  // would fill this section with whichever subjects happen to be written as
  // 題組 rather than with the ones people actually practise. MAX also
  // survives a sub-question being added to an existing group later, where
  // SUM would start reporting a number that means nothing in particular.
  //
  // Only enabled top-level questions count. A disabled question's past
  // attempts really did happen, but this section is an invitation to
  // practise, and adaptive selection will not serve them -- so counting
  // them could put a subject at the top of the page that has nothing left
  // to answer.
  .get('/popular', async (c) => {
    console.log('GET /api/info/popular');
    const db = c.get('db');

    const top = alias(questionTable, 'top');
    // One row per servable top-level question, carrying the attempts of
    // the whole question (a 題組 included). Everything below groups these
    // rows, so each question weighs exactly one regardless of how many
    // sub-questions it is made of.
    const perQuestion = db
      .select({
        id: top.id,
        subjectId: top.subjectId,
        attempts: sql<number>`max(${questionTable.attempCount})`.as('attempts'),
      })
      .from(questionTable)
      // Every question row joined to the top-level row that owns it: a
      // standalone question to itself, a sub-question to its parent.
      .innerJoin(top, sql`${top.id} = coalesce(${questionTable.parentId}, ${questionTable.id})`)
      .where(and(isNull(top.parentId), eq(top.enabled, true)))
      .groupBy(top.id, top.subjectId)
      .as('per_question');

    // SUM() over an INT column comes back from MySQL as DECIMAL, which
    // mysql2 hands over as a string; the cast keeps it a number here and
    // the Number() below covers the driver changing its mind.
    const attempts = sql<number>`cast(coalesce(sum(${perQuestion.attempts}), 0) as signed)`;
    const questions = count();

    const subjects = await db
      .select({
        id: subjectTable.id,
        name: subjectTable.name,
        attemptCount: attempts,
        questionCount: questions,
      })
      .from(perQuestion)
      .innerJoin(subjectTable, eq(subjectTable.id, perQuestion.subjectId))
      .groupBy(subjectTable.id, subjectTable.name)
      // The tie-breakers are what make this section usable before anyone
      // has answered anything: with every attemptCount still 0, ordering
      // by attempts alone would hand MySQL a free choice of three
      // subjects, and the page would reshuffle itself between requests.
      .orderBy(
        desc(attempts),
        desc(questions),
        asc(subjectTable.sortOrder),
        asc(subjectTable.id)
      )
      .limit(POPULAR_SUBJECT_LIMIT);

    if (subjects.length === 0) return c.json([]);

    // Exams are attributed through the top-level question's own subject
    // rather than through exam_subject: an exam can be linked to several
    // subjects, and what belongs on a subject's card is the attempts its
    // own questions drew, not the exam's total everywhere.
    const examRows = await db
      .select({
        subjectId: perQuestion.subjectId,
        id: examTable.id,
        name: examTable.name,
        attemptCount: attempts,
        questionCount: questions,
      })
      .from(perQuestion)
      // question_exam is only ever populated on the parent of a 題組, so
      // the link is read off the rolled-up top-level row.
      .innerJoin(questionExamTable, eq(questionExamTable.questionId, perQuestion.id))
      .innerJoin(examTable, eq(examTable.id, questionExamTable.examId))
      .where(
        inArray(
          perQuestion.subjectId,
          subjects.map((s) => s.id)
        )
      )
      .groupBy(perQuestion.subjectId, examTable.id, examTable.name)
      .orderBy(desc(attempts), desc(questions), asc(examTable.id));

    // Top-N-per-group in SQL would need a window function for the sake of
    // trimming at most a few hundred rows, so the cut happens here.
    const examsBySubject = new Map<number, typeof examRows>();
    for (const row of examRows) {
      const list = examsBySubject.get(row.subjectId) ?? [];
      if (list.length < POPULAR_EXAM_LIMIT) list.push(row);
      examsBySubject.set(row.subjectId, list);
    }

    return c.json(
      subjects.map((subject) => ({
        id: subject.id,
        name: subject.name,
        attemptCount: Number(subject.attemptCount),
        questionCount: Number(subject.questionCount),
        exams: (examsBySubject.get(subject.id) ?? []).map((exam) => ({
          id: exam.id,
          name: exam.name,
          attemptCount: Number(exam.attemptCount),
          questionCount: Number(exam.questionCount),
        })),
      }))
    );
  });
