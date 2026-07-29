import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb, getDb } from 'src/db/client';
import {
  categoryTable,
  conceptGroupTable,
  conceptTable,
  examSubjectTable,
  examTable,
  questionConceptTable,
  questionExamTable,
  questionTable,
  questionTagTable,
  subjectCategoryTable,
  subjectTable,
  tagTable,
} from 'src/db/schema';

const sendMock = vi.fn();
vi.mock('@aws-sdk/client-eventbridge', () => ({
  // Must be a real (non-arrow) function -- processNextQuestion/
  // enableFacebookEventBridge call `new EventBridgeClient(...)`, and
  // arrow functions can't be constructors.
  EventBridgeClient: vi.fn(function EventBridgeClient() {
    return { send: sendMock };
  }),
  // Same reasoning -- these are constructed with `new` too.
  EnableRuleCommand: vi.fn(function EnableRuleCommand(input: unknown) {
    return { __command: 'EnableRuleCommand', input };
  }),
  DisableRuleCommand: vi.fn(function DisableRuleCommand(input: unknown) {
    return { __command: 'DisableRuleCommand', input };
  }),
}));

vi.mock('src/lib/htmlSnapshot', () => ({
  htmlToS3Url: vi.fn(),
  deleteS3File: vi.fn(),
}));

import { deleteS3File, htmlToS3Url } from 'src/lib/htmlSnapshot';
import { enableFacebookEventBridge } from 'src/lib/facebookEventBridge';
import { processNextQuestion } from 'src/lib/facebookPoster';

const clearTables = async () => {
  const db = getDb();
  await db.delete(questionTagTable);
  await db.delete(questionConceptTable);
  await db.delete(questionExamTable);
  await db.update(questionTable).set({ parentId: null });
  await db.delete(questionTable);
  await db.delete(conceptTable);
  await db.delete(conceptGroupTable);
  await db.delete(tagTable);
  await db.delete(examSubjectTable);
  await db.delete(examTable);
  await db.delete(subjectCategoryTable);
  await db.delete(subjectTable);
  await db.delete(categoryTable);
};

// Seeds a subject linked to a category, with one exam, one tag, and one
// concept -- everything buildCaption pulls hashtags from, plus a
// question row directly (bypassing the admin API since none of this
// needs its validation).
const seedFixture = async () => {
  const db = getDb();
  const [{ insertId: categoryId }] = await db.insert(categoryTable).values({ name: 'fixture category', createdAt: new Date() });
  const [{ insertId: subjectId }] = await db.insert(subjectTable).values({ name: 'fixture subject', createdAt: new Date() });
  await db.insert(subjectCategoryTable).values({ subjectId, categoryId });
  const [{ insertId: examId }] = await db.insert(examTable).values({ name: 'fixture exam', createdAt: new Date() });
  await db.insert(examSubjectTable).values({ examId, subjectId });
  const [{ insertId: tagId }] = await db.insert(tagTable).values({ name: 'fixture tag', subjectId, createdAt: new Date() });
  const [{ insertId: groupId }] = await db.insert(conceptGroupTable).values({ name: 'fixture group', subjectId, createdAt: new Date() });
  const [{ insertId: conceptId }] = await db.insert(conceptTable).values({ name: 'fixture concept', conceptGroupId: groupId, createdAt: new Date() });
  return { categoryId, subjectId, examId, tagId, conceptId };
};

const insertQuestion = async (
  subjectId: number,
  overrides: Partial<{ content: string | null; fbPostId: string | null; parentId: number | null; sortOrder: number | null }> = {}
) => {
  const db = getDb();
  const now = new Date();
  const [{ insertId }] = await db.insert(questionTable).values({
    uuid: crypto.randomUUID(),
    subjectId,
    parentId: overrides.parentId ?? null,
    fbPostId: overrides.fbPostId ?? null,
    isGroup: false,
    type: 'SINGLE',
    sortOrder: overrides.sortOrder ?? null,
    content: overrides.content === undefined ? 'question content' : overrides.content,
    options: 'A|B',
    answer: 'A',
    difficulty: 5,
    adjustedDifficulty: 5,
    createdAt: now,
    updatedAt: now,
  });
  return insertId;
};

describe('facebookPoster', () => {
  beforeAll(clearTables);

  beforeEach(() => {
    vi.stubEnv('PROJECT', 'testproject');
    vi.stubEnv('ENVR', 'testenv');
    sendMock.mockReset();
    vi.mocked(htmlToS3Url).mockReset();
    vi.mocked(deleteS3File).mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(async () => {
    await clearTables();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await closeDb();
  });

  describe('processNextQuestion', () => {
    it('disables the EventBridge rule when there is nothing left to post', async () => {
      await processNextQuestion(getDb());

      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(sendMock.mock.calls[0][0]).toMatchObject({
        __command: 'DisableRuleCommand',
        input: { Name: 'testproject-testenv-facebook' },
      });
      expect(htmlToS3Url).not.toHaveBeenCalled();
    });

    it('posts the oldest unposted question, builds the caption, and records the resulting post id', async () => {
      const { subjectId, examId, tagId, conceptId } = await seedFixture();
      const questionId = await insertQuestion(subjectId, { content: '<p>hello</p>' });
      const db = getDb();
      await db.insert(questionExamTable).values({ questionId, examId });
      await db.insert(questionTagTable).values({ questionId, tagId });
      await db.insert(questionConceptTable).values({ questionId, conceptId });

      vi.mocked(htmlToS3Url).mockResolvedValue({ url: 'https://s3.example.com/img.png', key: 'questions/abc.png' });
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ post_id: 'page_post123' }), { status: 200 })
      );

      await processNextQuestion(getDb());

      expect(htmlToS3Url).toHaveBeenCalledWith('<p>hello</p>');
      expect(fetch).toHaveBeenCalledTimes(1);
      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe('https://graph.facebook.com/undefined/photos');
      const body = new URLSearchParams(init!.body as string);
      expect(body.get('url')).toBe('https://s3.example.com/img.png');
      expect(body.get('caption')).toContain('#fixturecategory');
      expect(body.get('caption')).toContain('#fixturesubject');
      expect(body.get('caption')).toContain('#fixtureexam');
      expect(body.get('caption')).toContain('#fixturetag');
      expect(body.get('caption')).toContain('#fixtureconcept');

      const [updated] = await getDb().select().from(questionTable).where(eq(questionTable.id, questionId));
      expect(updated.fbPostId).toBe('page_post123');

      expect(deleteS3File).toHaveBeenCalledWith('questions/abc.png');
    });

    it("includes a GROUP question's children content, sorted, in the rendered HTML", async () => {
      const { subjectId } = await seedFixture();
      const groupId = await insertQuestion(subjectId, { content: '<p>group header</p>' });
      await insertQuestion(subjectId, { content: '<p>child B</p>', parentId: groupId, sortOrder: 1 });
      await insertQuestion(subjectId, { content: '<p>child A</p>', parentId: groupId, sortOrder: 0 });

      vi.mocked(htmlToS3Url).mockResolvedValue({ url: 'https://s3.example.com/img.png', key: 'k' });
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ post_id: 'p_1' }), { status: 200 }));

      await processNextQuestion(getDb());

      expect(htmlToS3Url).toHaveBeenCalledWith('<p>group header</p><p>child A</p><p>child B</p>');
    });

    it('skips already-posted and content-less questions, picking the oldest valid one', async () => {
      const { subjectId } = await seedFixture();
      await insertQuestion(subjectId, { content: '<p>already posted</p>', fbPostId: 'existing_post' });
      await insertQuestion(subjectId, { content: null }); // no content
      const validId = await insertQuestion(subjectId, { content: '<p>valid</p>' });

      vi.mocked(htmlToS3Url).mockResolvedValue({ url: 'https://s3.example.com/img.png', key: 'k' });
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ post_id: 'p_2' }), { status: 200 }));

      await processNextQuestion(getDb());

      const [updated] = await getDb().select().from(questionTable).where(eq(questionTable.id, validId));
      expect(updated.fbPostId).toBe('p_2');
    });

    it("never independently posts a GROUP question's child", async () => {
      const { subjectId } = await seedFixture();
      const parentId = await insertQuestion(subjectId, { content: '<p>parent</p>' });
      const childId = await insertQuestion(subjectId, { content: '<p>child</p>', parentId });

      vi.mocked(htmlToS3Url).mockResolvedValue({ url: 'https://s3.example.com/img.png', key: 'k' });
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ post_id: 'parent_post' }), { status: 200 }));

      // First call: the parent (the only eligible top-level row) gets
      // posted, with the child's content folded into the same image.
      await processNextQuestion(getDb());
      const [parentAfter] = await getDb().select().from(questionTable).where(eq(questionTable.id, parentId));
      expect(parentAfter.fbPostId).toBe('parent_post');

      // Second call: if the child were independently eligible (i.e. the
      // parentId filter didn't apply), it would get posted here on its
      // own. Instead nothing is left, so the rule disables.
      sendMock.mockClear();
      vi.mocked(htmlToS3Url).mockClear();
      await processNextQuestion(getDb());

      const [childAfter] = await getDb().select().from(questionTable).where(eq(questionTable.id, childId));
      expect(childAfter.fbPostId).toBeNull();
      expect(htmlToS3Url).not.toHaveBeenCalled();
      expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ __command: 'DisableRuleCommand' }));
    });

    it('deletes the uploaded S3 image even if the Facebook post request fails', async () => {
      const { subjectId } = await seedFixture();
      await insertQuestion(subjectId, { content: '<p>hello</p>' });

      vi.mocked(htmlToS3Url).mockResolvedValue({ url: 'https://s3.example.com/img.png', key: 'questions/fail.png' });
      vi.mocked(fetch).mockResolvedValue(new Response('server error', { status: 500 }));

      await expect(processNextQuestion(getDb())).rejects.toThrow();
      expect(deleteS3File).toHaveBeenCalledWith('questions/fail.png');
    });
  });

  describe('enableFacebookEventBridge', () => {
    it('enables the rule by name', async () => {
      sendMock.mockResolvedValue({});
      await enableFacebookEventBridge();

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({ __command: 'EnableRuleCommand', input: { Name: 'testproject-testenv-facebook' } })
      );
    });

    it('swallows an EventBridge failure rather than throwing (best-effort)', async () => {
      sendMock.mockRejectedValue(new Error('EventBridge unavailable'));

      await expect(enableFacebookEventBridge()).resolves.toBeUndefined();
    });
  });
});
