import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import {
  questionExamTable,
  questionTagTable,
  subjectCategoryTable,
  subjectTable,
  userWrongQuestionTable,
} from 'src/db/schema';
import { DEFAULT_LIMIT, genPagination, MAX_LIMIT, paginationSchema } from 'src/lib/paginator';
import { buildQuestionDtos, parseIdList, questionDetailSchema } from 'src/routes/question';
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

/**
 * What this API reports, one schema per response.
 *
 * Schemas rather than the hand-written DTOs that used to sit here: each
 * is the single description of its response, the handlers' returns are
 * checked against it, and the OpenAPI document is generated from it.
 * `questionDetailSchema` comes from the question group, which is where
 * that shape belongs. See "The OpenAPI document" in AGENTS.md.
 */
export const wrongQuestionEntrySchema = z.object({
  id: z
    .number()
    .int()
    .describe(
      'The user_wrong_question row -- what PUT /{id}/note and DELETE /{id} act on. The note is per sub-question, since that is the granularity a user writes it at'
    ),
  question: questionDetailSchema,
  score: z.number().int().describe('0-10, from the most recent wrong attempt'),
  wrongCount: z.number().int().describe('How many times this has gone wrong'),
  lastWrongAt: z.string().describe('ISO 8601'),
  note: z.string().nullable(),
  createdAt: z.string().nullable().describe('ISO 8601'),
  updatedAt: z.string().nullable().describe('ISO 8601'),
});

export const wrongQuestionGroupSchema = z.object({
  id: z
    .number()
    .int()
    .describe(
      "The group key: the parent's question id, or the question's own id when standalone -- in which case parentQuestion is null and entries holds exactly one"
    ),
  parentQuestion: questionDetailSchema.nullable(),
  subject: z.object({ id: z.number().int(), name: z.string() }),
  subjectId: z.number().int(),
  lastWrongAt: z
    .string()
    .describe('ISO 8601. The most recent in the group -- what the list sorts on'),
  entries: z
    .array(wrongQuestionEntrySchema)
    .describe('In the order the sub-questions appear in the paper, not by when each went wrong'),
});

export const getWrongQuestionResponseSchema = z.object({
  data: z.array(wrongQuestionGroupSchema),
  paginate: paginationSchema,
});

export const putWrongQuestionNoteResponseSchema = z.object({
  id: z.number().int(),
  note: z.string().nullable(),
  updatedAt: z
    .string()
    .describe('ISO 8601. Always set -- this response is the write that just happened'),
});

/**
 * The OpenAPI entries for the routes below.
 *
 * Hoisted out of the route definitions so the handlers keep their own
 * indentation; `describeRoute` is middleware, so where it is
 * constructed makes no difference.
 */
const listDoc = describeRoute({
  summary: "The caller's wrong questions",
  description:
    'Behind requireUser, and scoped to the caller. **Paginated by group, not by row**: a 題組 holds one row per wrong sub-question, and a flat page repeated the whole passage once per row and could split siblings across a page boundary. `paginate.total` therefore counts groups. A row whose question has since been deleted is dropped rather than rendered broken, and a group left empty goes with it. Same filters as GET /api/reply.',
  tags: ['wrong-question'],
  responses: {
    200: {
      description: 'One page of groups, most recently wrong first',
      content: { 'application/json': { schema: resolver(getWrongQuestionResponseSchema) } },
    },
    400: { description: 'limit beyond the cap, or a malformed filter' },
    401: { description: 'No valid identity' },
  },
});

const noteDoc = describeRoute({
  summary: 'Write or clear the note on one wrong sub-question',
  description:
    'Behind requireUser, and scoped to the caller: a row belonging to someone else reads as 404 rather than 403, so this never confirms that a given id exists for another user. `note: null` clears it.',
  tags: ['wrong-question'],
  responses: {
    200: {
      description: 'The id, the note as saved, and when',
      content: { 'application/json': { schema: resolver(putWrongQuestionNoteResponseSchema) } },
    },
    400: { description: 'note missing, or longer than 2000 characters' },
    401: { description: 'No valid identity' },
    404: { description: 'No such row belongs to this caller' },
  },
});

const deleteDoc = describeRoute({
  summary: 'Remove one wrong sub-question from the list',
  description:
    'Behind requireUser, and scoped to the caller. Answering it wrong again puts it back -- POST /api/reply re-adds anything scoring below 10.',
  tags: ['wrong-question'],
  responses: {
    204: { description: 'Removed' },
    401: { description: 'No valid identity' },
    404: { description: 'No such row belongs to this caller' },
  },
});

type WrongQuestionGroupDto = z.infer<typeof wrongQuestionGroupSchema>;

export const wrongQuestion = new Hono<UserEnv>()
  .get('/', listDoc, zValidator('query', wrongQuestionListQuerySchema), async (c) => {
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
      return c.json({
        data: [],
        paginate: genPagination(total, limit, offset),
      } satisfies z.infer<typeof getWrongQuestionResponseSchema>);

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

    return c.json({
      data,
      paginate: genPagination(total, limit, offset),
    } satisfies z.infer<typeof getWrongQuestionResponseSchema>);
  })
  .put('/:id/note', noteDoc, zValidator('json', wrongQuestionNoteBodySchema), async (c) => {
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

    return c.json({
      id,
      note,
      updatedAt: updatedAt.toISOString(),
    } satisfies z.infer<typeof putWrongQuestionNoteResponseSchema>);
  })
  .delete('/:id', deleteDoc, async (c) => {
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
