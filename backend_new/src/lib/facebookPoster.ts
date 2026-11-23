import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { MySql2Database } from 'drizzle-orm/mysql2';
import {
  categoryTable,
  conceptTable,
  examTable,
  questionConceptTable,
  questionExamTable,
  questionTable,
  questionTagTable,
  subjectCategoryTable,
  subjectTable,
  tagTable,
} from 'src/db/schema';
import { disableFacebookEventBridge } from 'src/lib/facebookEventBridge';
import { deleteS3File, htmlToS3Url } from 'src/lib/htmlSnapshot';

type Db = MySql2Database;

const postToFacebook = async (imageUrl: string, caption: string): Promise<{ post_id: string }> => {
  const params = new URLSearchParams({
    url: imageUrl,
    access_token: process.env.FB_ACCESS_TOKEN ?? '',
    caption,
  });
  const res = await fetch(`https://graph.facebook.com/${process.env.FB_PAGE_ID}/photos`, {
    method: 'POST',
    body: params,
  });
  if (!res.ok) throw new Error(`Facebook post failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { post_id: string };
};

/**
 * Rewrites the text of a post that is already up, because the question's
 * exam/tag/concept links changed under it.
 *
 * `POST /{page-post-id}` with `message` is the only edit Graph API
 * documents for a published post. There is deliberately no sibling of
 * this for the image: no endpoint replaces a published photo (the Photo
 * node's Updating section says the operation is not available on it), so
 * a content edit clears fb_post_id and comes back through
 * postToFacebook as a new post instead.
 *
 * Note Facebook only allows this for posts the same app published --
 * anything posted to the page by hand is not ours to edit.
 */
const updateFacebookPostMessage = async (postId: string, caption: string): Promise<void> => {
  const params = new URLSearchParams({
    access_token: process.env.FB_ACCESS_TOKEN ?? '',
    message: caption,
  });
  const res = await fetch(`https://graph.facebook.com/${postId}`, {
    method: 'POST',
    body: params,
  });
  if (!res.ok) throw new Error(`Facebook post update failed: ${res.status} ${await res.text()}`);
};

// Hashtags: every category the question's subject belongs to, the
// subject itself, then its exam/tag/concept names -- same composition
// and ordering as the legacy version's caption, minus whitespace so each
// term survives as one hashtag.
const buildCaption = (terms: (string | undefined)[]): string =>
  terms
    .filter((t): t is string => Boolean(t))
    .map((t) => `#${t.replace(/\s+/g, '')}`)
    .join(' ');

/**
 * A question's hashtag line, read from its own links.
 *
 * Only ever called with a top-level row: a child's links never reach the
 * caption, which is why an edit to a child flags its parent.
 */
const buildCaptionForQuestion = async (
  db: Db,
  question: { id: number; subjectId: number }
): Promise<string> => {
  const [subject, categories, exams, tags, concepts] = await Promise.all([
    db.select().from(subjectTable).where(eq(subjectTable.id, question.subjectId)).then((rows) => rows[0]),
    db
      .select({ name: categoryTable.name })
      .from(subjectCategoryTable)
      .innerJoin(categoryTable, eq(categoryTable.id, subjectCategoryTable.categoryId))
      .where(eq(subjectCategoryTable.subjectId, question.subjectId)),
    db
      .select({ name: examTable.name })
      .from(questionExamTable)
      .innerJoin(examTable, eq(examTable.id, questionExamTable.examId))
      .where(eq(questionExamTable.questionId, question.id)),
    db
      .select({ name: tagTable.name })
      .from(questionTagTable)
      .innerJoin(tagTable, eq(tagTable.id, questionTagTable.tagId))
      .where(eq(questionTagTable.questionId, question.id)),
    db
      .select({ name: conceptTable.name })
      .from(questionConceptTable)
      .innerJoin(conceptTable, eq(conceptTable.id, questionConceptTable.conceptId))
      .where(eq(questionConceptTable.questionId, question.id)),
  ]);

  return buildCaption([
    ...categories.map((c) => c.name),
    subject?.name,
    ...exams.map((e) => e.name),
    ...tags.map((t) => t.name),
    ...concepts.map((c) => c.name),
  ]);
};

/**
 * One pending caption rewrite, oldest first; false when there is none,
 * which is how the caller knows this queue is empty too.
 *
 * No `enabled` filter, unlike the posting queue: a question disabled
 * after the fact still has a live post on the page, and the hashtags on
 * it should still be the current ones.
 *
 * A row whose update keeps failing -- the post deleted on Facebook by
 * hand, say -- holds the head of this queue and keeps the rule armed.
 * That is the same property the posting queue already has, and the
 * reason the lambda logs what it swallows.
 */
const processNextCaptionUpdate = async (db: Db): Promise<boolean> => {
  const [question] = await db
    .select()
    .from(questionTable)
    .where(
      and(
        isNull(questionTable.parentId),
        isNotNull(questionTable.fbPostId),
        eq(questionTable.fbCaptionDirty, true)
      )
    )
    .orderBy(asc(questionTable.id))
    .limit(1);

  if (question === undefined) return false;

  const caption = await buildCaptionForQuestion(db, question);
  await updateFacebookPostMessage(question.fbPostId as string, caption);
  await db
    .update(questionTable)
    .set({ fbCaptionDirty: false, updatedAt: new Date() })
    .where(eq(questionTable.id, question.id));
  return true;
};

/**
 * True when a child's content says nothing beyond which blank it is.
 *
 * 文意選填 and 篇章結構 keep every blank inside the passage and share one
 * option list, so each child exists only to carry an answer -- its content
 * is a bare marker like "第 21 題". Rendering those appends a run of
 * meaningless digits to the posted image ("21222324252627282930").
 *
 * Judged on the text, not the question type: a cloze whose blanks each
 * have their own options (`11. (A) what is more ...`) is also a GROUP of
 * SINGLEs, and those children must still be shown. The difference is
 * whether the child carries real text, which is exactly what this tests.
 */
const isBlankMarkerOnly = (content: string): boolean => {
  const text = content
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z]+;/gi, '')
    .trim();
  return text === '' || /^[(（]?\s*第?\s*\d+\s*題?\s*[.、)）]?\s*$/.test(text);
};

/**
 * The EventBridge-triggered job, one unit of work per run: pick the
 * oldest top-level question that has content but hasn't been posted yet,
 * render it to an image, post it to the Facebook page, and record the
 * resulting post id. Failing that, rewrite one stale caption. With
 * neither left it disables the rule, so it stops polling until a
 * question creation or edit re-arms it.
 */
export const processNextQuestion = async (db: Db): Promise<void> => {
  const [question] = await db
    .select()
    .from(questionTable)
    .where(
      and(
        isNull(questionTable.parentId),
        eq(questionTable.enabled, true),
        isNull(questionTable.fbPostId),
        isNotNull(questionTable.content)
      )
    )
    .orderBy(asc(questionTable.id))
    .limit(1);

  if (question === undefined) {
    // Nothing new to publish, but an edit may have invalidated the
    // caption of a post that is already up. The rule only stops polling
    // once both queues are empty.
    if (await processNextCaptionUpdate(db)) return;
    await disableFacebookEventBridge();
    return;
  }

  const [children, caption] = await Promise.all([
    db
      .select()
      .from(questionTable)
      .where(eq(questionTable.parentId, question.id))
      .orderBy(asc(questionTable.sortOrder)),
    buildCaptionForQuestion(db, question),
  ]);

  // Each kept child goes in its own block. A child's content is usually
  // bare text with no element of its own (`11. (A) ... (D) all in all`),
  // so concatenating them directly ran consecutive questions together in
  // the rendered image -- "all in all12. (A) demonstrate". A div rather
  // than a p because a child may already contain block markup, and p
  // cannot nest.
  const fullContent = [
    question.content,
    ...children.map((c) =>
      c.content === null || isBlankMarkerOnly(c.content)
        ? null
        : `<div class="child-question">${c.content}</div>`
    ),
  ]
    .filter(Boolean)
    .join('');

  const { url, key } = await htmlToS3Url(fullContent);
  try {
    const fbPost = await postToFacebook(url, caption);
    await db
      .update(questionTable)
      // Clearing the flag here covers both the ordinary case (it was
      // never set) and a question edited before it was ever posted: this
      // post carries the current caption either way.
      .set({ fbPostId: fbPost.post_id, fbCaptionDirty: false, updatedAt: new Date() })
      .where(eq(questionTable.id, question.id));
  } finally {
    await deleteS3File(key);
  }
};
