import { zValidator } from '@hono/zod-validator';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
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

type WrongQuestionDto = {
  id: number;
  parentQuestion: QuestionDetailDto | null;
  question: QuestionDetailDto;
  subject: { id: number; name: string };
  subjectId: number;
  score: number;
  wrongCount: number;
  lastWrongAt: string | null;
  note: string | null;
  createdAt: string | null;
  updatedAt: string | null;
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

    const [{ total }] = await db
      .select({ total: count() })
      .from(userWrongQuestionTable)
      .where(and(...userConditions));

    // Most recently *wrong* first (not first-ever-marked-wrong) -- there's
    // no "batch" grouping here like /reply's repliedAt (each row is
    // already one question, not one submitted batch), so this is a flat,
    // directly paginated list.
    const rows = await db
      .select()
      .from(userWrongQuestionTable)
      .where(and(...userConditions))
      .orderBy(desc(userWrongQuestionTable.lastWrongAt))
      .limit(limit)
      .offset(offset);

    if (rows.length === 0) return c.json({ data: [], paginate: genPagination(total, limit, offset) });

    const questionIds = [...new Set(rows.flatMap((r) => [r.questionId, ...(r.parentId ? [r.parentId] : [])]))];
    const subjectIds = [...new Set(rows.map((r) => r.subjectId))];
    const [questionDtoById, subjects] = await Promise.all([
      buildQuestionDtos(db, questionIds),
      db.select({ id: subjectTable.id, name: subjectTable.name }).from(subjectTable).where(inArray(subjectTable.id, subjectIds)),
    ]);
    const subjectById = new Map(subjects.map((s) => [s.id, s]));

    // A row whose question was since deleted has nothing left to show --
    // buildQuestionDtos simply omits ids it can't find, so this drops it
    // rather than rendering a broken entry.
    const data: WrongQuestionDto[] = [];
    for (const row of rows) {
      const question = questionDtoById.get(row.questionId);
      if (!question) continue;
      const parentQuestion = row.parentId ? questionDtoById.get(row.parentId) ?? null : null;
      const subject = subjectById.get(row.subjectId);
      data.push({
        id: row.id,
        parentQuestion,
        question,
        subject: subject ?? { id: row.subjectId, name: '' },
        subjectId: row.subjectId,
        score: row.score,
        wrongCount: row.wrongCount,
        lastWrongAt: row.lastWrongAt.toISOString(),
        note: row.note,
        createdAt: row.createdAt?.toISOString() ?? null,
        updatedAt: row.updatedAt?.toISOString() ?? null,
      });
    }

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
