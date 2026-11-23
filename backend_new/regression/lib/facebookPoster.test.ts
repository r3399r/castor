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
  overrides: Partial<{ content: string | null; fbPostId: string | null; fbCaptionDirty: boolean; parentId: number | null; sortOrder: number | null; enabled: boolean }> = {}
) => {
  const db = getDb();
  const now = new Date();
  const [{ insertId }] = await db.insert(questionTable).values({
    uuid: crypto.randomUUID(),
    subjectId,
    parentId: overrides.parentId ?? null,
    fbPostId: overrides.fbPostId ?? null,
    fbCaptionDirty: overrides.fbCaptionDirty ?? false,
    isGroup: false,
    // The poster only picks up enabled questions (they are created
    // disabled and wait for an admin review); these tests are about what
    // it does once a question is postable, so default to enabled.
    enabled: overrides.enabled ?? true,
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

      expect(htmlToS3Url).toHaveBeenCalledWith(
        '<p>group header</p>' +
          '<div class="child-question"><p>child A</p></div>' +
          '<div class="child-question"><p>child B</p></div>'
      );
    });

    // The case above passes even unwrapped, because its fixtures carry
    // their own <p>. Real children are bare text, which is what actually
    // ran together in the posted image.
    it('keeps bare-text children from running into each other', async () => {
      const { subjectId } = await seedFixture();
      const groupId = await insertQuestion(subjectId, { content: '<p>passage</p>' });
      await insertQuestion(subjectId, {
        content: '11. (A) what is more (D) all in all',
        parentId: groupId,
        sortOrder: 0,
      });
      await insertQuestion(subjectId, {
        content: '12. (A) demonstrate (D) manipulate',
        parentId: groupId,
        sortOrder: 1,
      });

      vi.mocked(htmlToS3Url).mockResolvedValue({ url: 'https://s3.example.com/img.png', key: 'k' });
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ post_id: 'p_1' }), { status: 200 }));

      await processNextQuestion(getDb());

      const html = vi.mocked(htmlToS3Url).mock.calls[0][0];
      expect(html).not.toContain('all in all12.');
      expect(html).toContain('<div class="child-question">11. (A) what is more (D) all in all</div>');
      expect(html).toContain('<div class="child-question">12. (A) demonstrate (D) manipulate</div>');
    });


    // 文意選填 / 篇章結構: the blanks and the shared option list are already
    // in the passage, so the children only ever held answers. Rendering
    // them produced a run of bare digits under the passage.
    it('omits children whose content is only the blank number', async () => {
      const { subjectId } = await seedFixture();
      const groupId = await insertQuestion(subjectId, {
        content: '<p>passage with 21 and 22 and the (A)-(J) list</p>',
      });
      await insertQuestion(subjectId, { content: '第 21 題', parentId: groupId, sortOrder: 0 });
      await insertQuestion(subjectId, { content: '22', parentId: groupId, sortOrder: 1 });
      await insertQuestion(subjectId, { content: '(23)', parentId: groupId, sortOrder: 2 });

      vi.mocked(htmlToS3Url).mockResolvedValue({ url: 'https://s3.example.com/img.png', key: 'k' });
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ post_id: 'p_1' }), { status: 200 }));

      await processNextQuestion(getDb());

      expect(htmlToS3Url).toHaveBeenCalledWith(
        '<p>passage with 21 and 22 and the (A)-(J) list</p>'
      );
    });

    // The distinction is the text, not the question type -- these children
    // are the same SINGLE-inside-GROUP shape as the ones above.
    it('keeps children that carry their own option text', async () => {
      const { subjectId } = await seedFixture();
      const groupId = await insertQuestion(subjectId, { content: '<p>passage</p>' });
      await insertQuestion(subjectId, {
        content: '11. (A) what is more (D) all in all',
        parentId: groupId,
        sortOrder: 0,
      });

      vi.mocked(htmlToS3Url).mockResolvedValue({ url: 'https://s3.example.com/img.png', key: 'k' });
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ post_id: 'p_1' }), { status: 200 }));

      await processNextQuestion(getDb());

      expect(vi.mocked(htmlToS3Url).mock.calls[0][0]).toContain('11. (A) what is more');
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

    it('never posts a disabled question, picking the next enabled one instead', async () => {
      // The page is public, so a question that has not passed admin review
      // must not be auto-posted -- and since questions are created
      // disabled, this is the common case, not an edge one.
      const { subjectId } = await seedFixture();
      await insertQuestion(subjectId, { content: '<p>unreviewed</p>', enabled: false });
      const enabledId = await insertQuestion(subjectId, { content: '<p>reviewed</p>' });

      vi.mocked(htmlToS3Url).mockResolvedValue({ url: 'https://s3.example.com/img.png', key: 'k' });
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ post_id: 'p_3' }), { status: 200 }));

      await processNextQuestion(getDb());

      const [posted] = await getDb().select().from(questionTable).where(eq(questionTable.id, enabledId));
      expect(posted.fbPostId).toBe('p_3');
    });

    it('disables the rule when every remaining question is disabled', async () => {
      const { subjectId } = await seedFixture();
      await insertQuestion(subjectId, { content: '<p>unreviewed</p>', enabled: false });

      await processNextQuestion(getDb());

      expect(sendMock.mock.calls[0][0]).toMatchObject({
        __command: 'DisableRuleCommand',
      });
      expect(htmlToS3Url).not.toHaveBeenCalled();
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


    // Facebook can edit a published post's text but not its photo, so an
    // edit to a question's tags/concepts/exam is handled here rather
    // than by re-posting: question.fb_caption_dirty is the queue the
    // edit routes write to.
    describe('pending caption rewrites', () => {
      const captionOf = (call: number) =>
        new URLSearchParams(vi.mocked(fetch).mock.calls[call][1]!.body as string);

      const seedPostedQuestion = async (
        subjectId: number,
        links: { examId: number; tagId: number; conceptId: number },
        overrides: { fbPostId?: string; enabled?: boolean } = {}
      ) => {
        const questionId = await insertQuestion(subjectId, {
          content: '<p>posted</p>',
          fbPostId: overrides.fbPostId ?? 'page_post123',
          fbCaptionDirty: true,
          enabled: overrides.enabled ?? true,
        });
        const db = getDb();
        await db.insert(questionExamTable).values({ questionId, examId: links.examId });
        await db.insert(questionTagTable).values({ questionId, tagId: links.tagId });
        await db.insert(questionConceptTable).values({ questionId, conceptId: links.conceptId });
        return questionId;
      };

      it("rewrites a flagged post's text in place and clears the flag", async () => {
        const { subjectId, ...links } = await seedFixture();
        const questionId = await seedPostedQuestion(subjectId, links);

        vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));

        await processNextQuestion(getDb());

        // POST /{page-post-id} with `message` -- the one edit Graph API
        // documents for a published post. No photo endpoint is involved,
        // which is the whole reason this path exists.
        expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://graph.facebook.com/page_post123');
        expect(captionOf(0).get('message')).toContain('#fixturetag');
        expect(captionOf(0).get('message')).toContain('#fixtureconcept');
        expect(captionOf(0).get('url')).toBeNull();
        // Nothing is re-rendered or re-uploaded for a caption-only edit.
        expect(htmlToS3Url).not.toHaveBeenCalled();
        expect(deleteS3File).not.toHaveBeenCalled();

        const [after] = await getDb().select().from(questionTable).where(eq(questionTable.id, questionId));
        expect(after.fbCaptionDirty).toBe(false);
        expect(after.fbPostId).toBe('page_post123');
      });

      it('publishes a new question before rewriting any caption', async () => {
        const { subjectId, ...links } = await seedFixture();
        const flaggedId = await seedPostedQuestion(subjectId, links);
        const unpostedId = await insertQuestion(subjectId, { content: '<p>new</p>' });

        vi.mocked(htmlToS3Url).mockResolvedValue({ url: 'https://s3.example.com/img.png', key: 'k' });
        vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ post_id: 'p_new' }), { status: 200 }));

        // A backlog of new questions is what users are waiting for; a
        // stale hashtag can wait three minutes.
        await processNextQuestion(getDb());
        const [posted] = await getDb().select().from(questionTable).where(eq(questionTable.id, unpostedId));
        expect(posted.fbPostId).toBe('p_new');
        const [stillFlagged] = await getDb().select().from(questionTable).where(eq(questionTable.id, flaggedId));
        expect(stillFlagged.fbCaptionDirty).toBe(true);

        vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
        await processNextQuestion(getDb());
        const [rewritten] = await getDb().select().from(questionTable).where(eq(questionTable.id, flaggedId));
        expect(rewritten.fbCaptionDirty).toBe(false);
      });

      it('keeps the rule armed while a caption rewrite is still pending', async () => {
        const { subjectId, ...links } = await seedFixture();
        await seedPostedQuestion(subjectId, links);

        vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));

        // Nothing to post, so the old code would have disarmed here and
        // the edit would never have reached Facebook.
        await processNextQuestion(getDb());
        expect(sendMock).not.toHaveBeenCalled();

        // Queue drained: now it disarms.
        await processNextQuestion(getDb());
        expect(sendMock).toHaveBeenCalledWith(
          expect.objectContaining({ __command: 'DisableRuleCommand' })
        );
      });

      it('ignores the flag on a question with no post to rewrite', async () => {
        const { subjectId } = await seedFixture();
        // The edit routes set the flag unconditionally, so a question
        // edited before it was ever posted carries it with no post id.
        // Acted on, this row would keep the rule polling forever.
        await insertQuestion(subjectId, { content: null, fbCaptionDirty: true });

        await processNextQuestion(getDb());

        expect(fetch).not.toHaveBeenCalled();
        expect(sendMock).toHaveBeenCalledWith(
          expect.objectContaining({ __command: 'DisableRuleCommand' })
        );
      });

      it("rewrites a disabled question's caption, since its post is still up", async () => {
        const { subjectId, ...links } = await seedFixture();
        await seedPostedQuestion(subjectId, links, { enabled: false });

        vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));

        // Disabling hides a question from practice; it does not take the
        // post off the page, so the hashtags on it should still be
        // current. (The posting queue does filter on enabled -- an
        // unreviewed question must not reach the page at all.)
        await processNextQuestion(getDb());

        expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://graph.facebook.com/page_post123');
      });

      it('never treats a child row as having its own post', async () => {
        const { subjectId, ...links } = await seedFixture();
        const parentId = await seedPostedQuestion(subjectId, links);
        await getDb()
          .update(questionTable)
          .set({ fbCaptionDirty: false })
          .where(eq(questionTable.id, parentId));
        // Only a top-level row ever gets an fb_post_id written to it; a
        // child carrying one is corrupt data, not a second post to edit.
        await insertQuestion(subjectId, {
          content: '<p>child</p>',
          parentId,
          fbPostId: 'child_post',
          fbCaptionDirty: true,
        });

        await processNextQuestion(getDb());

        expect(fetch).not.toHaveBeenCalled();
        expect(sendMock).toHaveBeenCalledWith(
          expect.objectContaining({ __command: 'DisableRuleCommand' })
        );
      });

      it('leaves the flag set when Facebook rejects the rewrite', async () => {
        const { subjectId, ...links } = await seedFixture();
        const questionId = await seedPostedQuestion(subjectId, links);

        vi.mocked(fetch).mockResolvedValue(new Response('bad token', { status: 400 }));

        // The lambda logs and swallows, and the rule fires again in three
        // minutes -- so the flag has to survive a failure or the edit is
        // lost silently.
        await expect(processNextQuestion(getDb())).rejects.toThrow('Facebook post update failed');

        const [after] = await getDb().select().from(questionTable).where(eq(questionTable.id, questionId));
        expect(after.fbCaptionDirty).toBe(true);
      });

      it('clears a flag left over from an edit made before the first post', async () => {
        const { subjectId, ...links } = await seedFixture();
        const questionId = await insertQuestion(subjectId, {
          content: '<p>edited while unposted</p>',
          fbCaptionDirty: true,
        });
        const db = getDb();
        await db.insert(questionExamTable).values({ questionId, examId: links.examId });

        vi.mocked(htmlToS3Url).mockResolvedValue({ url: 'https://s3.example.com/img.png', key: 'k' });
        vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ post_id: 'p_first' }), { status: 200 }));

        await processNextQuestion(getDb());

        // The new post carries the current caption, so there is nothing
        // left to rewrite -- without this the next tick would spend a
        // Graph API call writing the text it just published.
        const [after] = await getDb().select().from(questionTable).where(eq(questionTable.id, questionId));
        expect(after.fbPostId).toBe('p_first');
        expect(after.fbCaptionDirty).toBe(false);
      });
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
