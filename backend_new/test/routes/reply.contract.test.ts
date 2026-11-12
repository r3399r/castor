import type {
  Concept,
  ConceptGroup,
  Exam,
  GetReplyResponse,
  GetWrongQuestionResponse,
  Paginate,
  PostReplyResponse,
  PutWrongQuestionNoteResponse,
  Question,
  Reply,
  ReplyGroup,
  Tag,
  WrongQuestion,
  WrongQuestionEntry,
} from '@castor/shared';
import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import {
  questionDetailChildSchema,
  questionDetailSchema,
} from 'src/routes/question';
import { postReplyResponseSchema, replyGroupSchema } from 'src/routes/reply';
import {
  getWrongQuestionResponseSchema,
  putWrongQuestionNoteResponseSchema,
  wrongQuestionEntrySchema,
  wrongQuestionGroupSchema,
} from 'src/routes/wrongQuestion';

/**
 * Flattens an intersection into a plain object type.
 *
 * `expectTypeOf(...).toEqualTypeOf` compares how a type is written, not
 * only what shape it is: `A & B` and the single object with all those
 * keys are the same shape and not the same type to it. The schemas infer
 * flat objects, so the expected sides below are flattened to match.
 */
type Flat<T> = { [K in keyof T]: T[K] };

/**
 * What an embedded question actually is, stated over `Question`.
 *
 * `packages/shared`'s `Question` is the widest type in the package and
 * the response has never matched it. Six fields it claims are not sent
 * at all, and five more are sent in a reduced form. Written out here
 * once, because three responses embed it.
 *
 * The omissions are not oversights:
 *
 *   - `subject` would be the `Subject` monster, which carries its own
 *     `exams`, `tags`, `conceptGroups` and `category`. `subjectId` is
 *     what the clients actually use.
 *   - `enabled`, `attempCount` and `scoringTotal` are the admin review
 *     gate and the scoring counters. Practice responses have no use for
 *     them, and `attempCount` in particular is what GET /api/info/popular
 *     aggregates -- per-question attempt counts are not something a
 *     practice screen needs.
 *   - `createdAt`/`updatedAt` are editorial history.
 *
 * And the reductions: `exam` and `tag` come as id and name (the full
 * `Exam` claims `subject: Subject[]`, and `Tag` claims `subject:
 * Subject`), `concept` as id, name and its group's id and name, and
 * `children` as the eight scalar fields a sub-question has of its own.
 */
type ActualQuestion = Flat<
  Omit<
    Question,
    | 'subject'
    | 'enabled'
    | 'attempCount'
    | 'scoringTotal'
    | 'createdAt'
    | 'updatedAt'
    | 'type'
    | 'exam'
    | 'tag'
    | 'concept'
    | 'children'
  > & {
    /**
     * A string, not the six-value union. Every write validates against
     * those six, but the column is a varchar and these rows predate this
     * backend, so the response cannot promise one of them -- shared's
     * union is a narrower claim than the data supports.
     */
    type: string;
    exam: Pick<Exam, 'id' | 'name'>[];
    tag: Pick<Tag, 'id' | 'name'>[];
    concept: Flat<
      Pick<Concept, 'id' | 'name'> & { conceptGroup: Pick<ConceptGroup, 'id' | 'name'> }
    >[];
    children: Flat<
      Omit<
        Pick<
          Question,
          | 'id'
          | 'type'
          | 'sortOrder'
          | 'content'
          | 'options'
          | 'answer'
          | 'difficulty'
          | 'adjustedDifficulty'
        >,
        'type'
      > & { type: string }
    >[];
  }
>;

/**
 * Compile-time only; `npm run typecheck` is what enforces it.
 *
 * Answering and reviewing: POST/GET /api/reply and /api/wrong-question,
 * both behind requireUser and both scoped to the caller. The question
 * shape they embed lives in the question group, which is where it
 * belongs -- /question/adaptive sends the same thing -- so
 * `questionDetailSchema` was added there first, ahead of that group's
 * own routes.
 *
 * Both lists paginate **by group**, not by row: one 題組 answered in one
 * batch is one history row, and `paginate.total` counts groups. That is
 * the kind of thing a client author has to be told, so it is in the
 * route descriptions rather than only here.
 */
describe('the reply and wrong-question response schemas', () => {
  it('describe exactly what the webapp is typed against, where they match', () => {
    expectTypeOf<z.infer<typeof postReplyResponseSchema>>().toEqualTypeOf<PostReplyResponse>();
  });

  /**
   * Everything below embeds a question, so everything below differs --
   * and `Reply` and `ReplyGroup` add their own inventions on top.
   *
   * Spelled out with Omit and Pick over the shared types rather than
   * described in a comment, so each gap is a thing the compiler checks:
   * if a response is ever completed, one of these fails and has to be
   * re-stated.
   */
  it('and where shared overstates them, say exactly how', () => {
    expectTypeOf<z.infer<typeof questionDetailSchema>>().toEqualTypeOf<ActualQuestion>();
    expectTypeOf<Question>().not.toEqualTypeOf<z.infer<typeof questionDetailSchema>>();
    expectTypeOf<z.infer<typeof questionDetailChildSchema>>().toEqualTypeOf<
      ActualQuestion['children'][number]
    >();

    // A history row's `subject` is an id and a name; shared says the
    // whole `Subject`, recursive relations and all. Its `children` are
    // reply rows reduced to seven fields -- `Reply` claims thirteen,
    // including the user id, a second copy of the subject and the parent
    // question embedded again.
    expectTypeOf<z.infer<typeof replyGroupSchema>>().toEqualTypeOf<
      Flat<
        Omit<ReplyGroup, 'parentQuestion' | 'subject' | 'children'> & {
          parentQuestion: ActualQuestion | null;
          subject: { id: number; name: string };
          children: Flat<
            Pick<Reply, 'id' | 'questionId' | 'parentId' | 'score' | 'repliedAnswer' | 'createdAt'> & {
              question: ActualQuestion;
            }
          >[];
        }
      >
    >();
    expectTypeOf<GetReplyResponse>().not.toEqualTypeOf<
      Paginate<z.infer<typeof replyGroupSchema>>
    >();

    // The wrong-question list differs only in the embedded question --
    // `subject` is already an id and a name in the shared type, and
    // every other field matches.
    expectTypeOf<z.infer<typeof wrongQuestionEntrySchema>>().toEqualTypeOf<
      Flat<Omit<WrongQuestionEntry, 'question'> & { question: ActualQuestion }>
    >();
    expectTypeOf<z.infer<typeof wrongQuestionGroupSchema>>().toEqualTypeOf<
      Flat<
        Omit<WrongQuestion, 'parentQuestion' | 'entries'> & {
          parentQuestion: ActualQuestion | null;
          entries: Flat<Omit<WrongQuestionEntry, 'question'> & { question: ActualQuestion }>[];
        }
      >
    >();
    expectTypeOf<GetWrongQuestionResponse>().not.toEqualTypeOf<
      z.infer<typeof getWrongQuestionResponseSchema>
    >();

    // The one gap in the other direction here: the note response always
    // carries the write that just happened, so `updatedAt` is never
    // null, although the shared type allows it.
    expectTypeOf<z.infer<typeof putWrongQuestionNoteResponseSchema>>().toEqualTypeOf<
      Flat<Omit<PutWrongQuestionNoteResponse, 'updatedAt'> & { updatedAt: string }>
    >();
  });
});
