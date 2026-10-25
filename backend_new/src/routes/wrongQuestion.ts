import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  questionExamTable,
  questionTagTable,
  subjectCategoryTable,
  subjectTable,
  userWrongQuestionTable,
} from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT } from 'src/lib/paginator';
import { buildQuestionDtos, parseIdList, QuestionDetailDto } from 'src/routes/question';
import { UserEnv } from 'src/middleware/requireUser';
import { NotFoundError } from 'src/model/error';

// Same filter shape as /reply's replyListQuerySchema -- category/subject/
// exam/tag all mean the same thing here as they do there.
export const wrongQuestionListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
  categoryId: z.coerce.number().int().positive().optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  examIds: z.string().optional(),
  tagIds: z.string().optional(),
});

// note is nullable so it can be explicitly cleared back to "no note", not
// just omitted.
export const wrongQuestionNoteBodySchema = z.object({
  note: z.string().max(2000).nullable(),
});

// One wrong sub-question. `id` is the user_wrong_question row, which is
// what PUT /:id/note and DELETE /:id act on -- the note stays per
// sub-question, since that is the granularity a user writes it at.
type WrongQuestionEntryDto = {
  id: number;
  question: QuestionDetailDto;
  score: number;
  wrongCount: number;
  lastWrongAt: string;
  note: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

// One top-level question and every sub-question of it the user got wrong.
// `id` is the group key: the parent's question id, or the question's own
// id when it is standalone (then `entries` has exactly one element and
// `parentQuestion` is null).
type WrongQuestionGroupDto = {
  id: number;
  parentQuestion: QuestionDetailDto | null;
  subject: { id: number; name: string };
  subjectId: number;
  /** The most recent lastWrongAt in the group -- what the list sorts on. */
  lastWrongAt: string;
  entries: WrongQuestionEntryDto[];
};

export const wrongQuestion = new Hono<UserEnv>()
  .get('/', zValidator('query', wrongQuestionListQuerySchema), async (c) => {
    const { limit, offset, categoryId, subjectId, examIds, tagIds } = c.req.valid('query');
    const user = c.get('user');
    const db = c.get('db');
    console.log(
      `GET /api/wrong-question userId=${user.id} limit=${limit} offset=${offset} categoryId=${categoryId ?? ''} subjectId=${subjectId ?? ''} examIds=${examIds ?? ''} tagIds=${tagIds ?? ''}`
    );

    // Same filter resolution as /reply's GET / -- see the comments there
    // for why each one is shaped this way (subject-id-set for category,
    // groupKey for exam/tag since those links only ever live on a
    // question's top-level row).
    const groupKey = sql<number>`coalesce(${userWrongQuestionTable.parentId}, ${userWrongQuestionTable.questionId})`;
    const userConditions = [eq(userWrongQuestionTable.userId, user.id)];
    if (subjectId !== undefined) userConditions.push(eq(userWrongQuestionTable.subjectId, subjectId));

    if (categoryId !== undefined) {
      const links = await db
        .select({ subjectId: subjectCategoryTable.subjectId })
        .from(subjectCategoryTable)
        .where(eq(subjectCategoryTable.categoryId, categoryId));
      userConditions.push(inArray(userWrongQuestionTable.subjectId, links.map((l) => l.subjectId)));
    }

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

    // Paginated by group rather than by row. A GROUP question's children
    // are N separate wrong-question rows, and a flat page repeated the
    // whole passage once per row -- four wrong sub-questions of one
    // reading comprehension meant reading the same passage four times.
    // Worse, the flat ordering by lastWrongAt could split siblings across
    // a page boundary, so they were not even adjacent. A standalone
    // question groups under its own id and so comes back as a group of
    // one.
    const groupLastWrongAt = sql`max(${userWrongQuestionTable.lastWrongAt})`;
    const groupRows = await db
      .select({ groupKey })
      .from(userWrongQuestionTable)
      .where(and(...userConditions))
      .groupBy(groupKey)
      .orderBy(desc(groupLastWrongAt))
      .limit(limit)
      .offset(offset);

    // Counts groups, so it agrees with the page above -- count() here
    // would report rows and overstate the number of pages.
    const [{ total }] = await db
      .select({
        total: sql<number>`count(distinct coalesce(${userWrongQuestionTable.parentId}, ${userWrongQuestionTable.questionId}))`,
      })
      .from(userWrongQuestionTable)
      .where(and(...userConditions));

    if (groupRows.length === 0)
      return c.json({ data: [], paginate: genPagination(total, limit, offset) });

    // Only used to restore this page's group order after the fetch below,
    // which comes back ordered by row rather than by group.
    const pageOrder = new Map(groupRows.map((r, i) => [r.groupKey, i]));
    const rows = await db
      .select()
      .from(userWrongQuestionTable)
      .where(and(...userConditions, inArray(groupKey, [...pageOrder.keys()])))
      .orderBy(desc(userWrongQuestionTable.lastWrongAt));

    const questionIds = [...new Set(rows.flatMap((r) => [r.questionId, ...(r.parentId ? [r.parentId] : [])]))];
    const subjectIds = [...new Set(rows.map((r) => r.subjectId))];
    const [questionDtoById, subjects] = await Promise.all([
      buildQuestionDtos(db, questionIds),
      db.select({ id: subjectTable.id, name: subjectTable.name }).from(subjectTable).where(inArray(subjectTable.id, subjectIds)),
    ]);
    const subjectById = new Map(subjects.map((s) => [s.id, s]));

    // A row whose question was since deleted has nothing left to show --
    // buildQuestionDtos simply omits ids it can't find, so this drops the
    // entry rather than rendering a broken one. A group left with no
    // entries at all is dropped with it.
    const groupMap = new Map<number, WrongQuestionGroupDto>();
    for (const row of rows) {
      const key = row.parentId ?? row.questionId;
      if (!pageOrder.has(key)) continue;

      const question = questionDtoById.get(row.questionId);
      if (!question) continue;

      if (!groupMap.has(key)) {
        const subject = subjectById.get(row.subjectId);
        groupMap.set(key, {
          id: key,
          parentQuestion: row.parentId ? questionDtoById.get(row.parentId) ?? null : null,
          subject: subject ?? { id: row.subjectId, name: '' },
          subjectId: row.subjectId,
          // Derived from the entries rather than read back from the
          // max() above: an aggregate's type depends on how the driver
          // decodes it, while a column on a row is already a Date.
          lastWrongAt: row.lastWrongAt.toISOString(),
          entries: [],
        });
      }

      const group = groupMap.get(key)!;
      if (row.lastWrongAt.toISOString() > group.lastWrongAt)
        group.lastWrongAt = row.lastWrongAt.toISOString();

      group.entries.push({
        id: row.id,
        question,
        score: row.score,
        wrongCount: row.wrongCount,
        lastWrongAt: row.lastWrongAt.toISOString(),
        note: row.note,
        createdAt: row.createdAt?.toISOString() ?? null,
        updatedAt: row.updatedAt?.toISOString() ?? null,
      });
    }

    const data = [...groupMap.values()]
      .sort((a, b) => (pageOrder.get(a.id) ?? 0) - (pageOrder.get(b.id) ?? 0))
      // Within a group, in the order the sub-questions appear in the
      // paper -- not by when each went wrong, which would shuffle the
      // passage's own numbering and make the card hard to follow.
      .map((group) => ({
        ...group,
        entries: [...group.entries].sort(
          (a, b) => (a.question.sortOrder ?? 0) - (b.question.sortOrder ?? 0)
        ),
      }));

    return c.json({ data, paginate: genPagination(total, limit, offset) });
  })
  .put('/:id/note', zValidator('json', wrongQuestionNoteBodySchema), async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const id = Number(c.req.param('id'));
    const { note } = c.req.valid('json');
    console.log(`PUT /api/wrong-question/${id}/note userId=${user.id}`);

    // Scoped to the requesting user, not just the row id -- a mismatch
    // reads as 404 rather than 403, same as everywhere else this API
    // scopes a resource to its owner, so this never confirms to a caller
    // that a given id exists for someone else.
    const [found] = await db
      .select({ id: userWrongQuestionTable.id })
      .from(userWrongQuestionTable)
      .where(and(eq(userWrongQuestionTable.id, id), eq(userWrongQuestionTable.userId, user.id)));
    if (found === undefined) throw new NotFoundError(`wrong question ${id} not found`);

    const updatedAt = new Date();
    await db.update(userWrongQuestionTable).set({ note, updatedAt }).where(eq(userWrongQuestionTable.id, id));

    return c.json({ id, note, updatedAt: updatedAt.toISOString() });
  })
  .delete('/:id', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const id = Number(c.req.param('id'));
    console.log(`DELETE /api/wrong-question/${id} userId=${user.id}`);

    const [found] = await db
      .select({ id: userWrongQuestionTable.id })
      .from(userWrongQuestionTable)
      .where(and(eq(userWrongQuestionTable.id, id), eq(userWrongQuestionTable.userId, user.id)));
    if (found === undefined) throw new NotFoundError(`wrong question ${id} not found`);

    await db.delete(userWrongQuestionTable).where(eq(userWrongQuestionTable.id, id));
    return c.body(null, 204);
  });
