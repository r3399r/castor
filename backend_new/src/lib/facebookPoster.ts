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
 * The EventBridge-triggered job: pick the oldest top-level question that
 * has content but hasn't been posted yet, render it to an image, post it
 * to the Facebook page, and record the resulting post id. If there's
 * nothing left to post, disables the rule so it stops polling until the
 * next question creation re-arms it.
 */
export const processNextQuestion = async (db: Db): Promise<void> => {
  const [question] = await db
    .select()
    .from(questionTable)
    .where(
      and(isNull(questionTable.parentId), isNull(questionTable.fbPostId), isNotNull(questionTable.content))
    )
    .orderBy(asc(questionTable.id))
    .limit(1);

  if (question === undefined) {
    await disableFacebookEventBridge();
    return;
  }

  const [subject, categories, exams, tags, concepts, children] = await Promise.all([
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
    db
      .select()
      .from(questionTable)
      .where(eq(questionTable.parentId, question.id))
      .orderBy(asc(questionTable.sortOrder)),
  ]);

  const caption = buildCaption([
    ...categories.map((c) => c.name),
    subject?.name,
    ...exams.map((e) => e.name),
    ...tags.map((t) => t.name),
    ...concepts.map((c) => c.name),
  ]);

  const fullContent = [question.content, ...children.map((c) => c.content)].filter(Boolean).join('');

  const { url, key } = await htmlToS3Url(fullContent);
  try {
    const fbPost = await postToFacebook(url, caption);
    await db
      .update(questionTable)
      .set({ fbPostId: fbPost.post_id, updatedAt: new Date() })
      .where(eq(questionTable.id, question.id));
  } finally {
    await deleteS3File(key);
  }
};
