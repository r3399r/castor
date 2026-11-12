import type {
  GetQuestionAdaptiveResponse,
  GetQuestionIdResponse,
  Paginate,
  PostQuestionResponse,
  Question,
} from '@castor/shared';
import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import {
  adminQuestionRowSchema,
  getQuestionAdaptiveResponseSchema,
  getQuestionByIdResponseSchema,
  getQuestionListResponseSchema,
  postQuestionResponseSchema,
  questionDetailChildSchema,
  questionDetailSchema,
  questionRowSchema,
} from 'src/routes/question';

/**
 * Flattens an intersection into a plain object type.
 *
 * `expectTypeOf(...).toEqualTypeOf` compares how a type is written, not
 * only what shape it is: `A & B` and the single object with all those
 * keys are the same shape and not the same type to it.
 */
type Flat<T> = { [K in keyof T]: T[K] };

/**
 * A question row: `Question` without the relations it never carries.
 *
 * `Question` is the widest type in packages/shared, and no response has
 * ever matched it -- see test/routes/reply.contract.test.ts for the
 * other shape it is wrong about. Here the five relation fields are the
 * difference: this group sends ids and counts instead, through separate
 * endpoints.
 *
 * `durationMedianMs` appears on neither side and that is the point: it
 * is a column on the table, the per-question median reply time the
 * points time-weight reads, and three handlers used to send it because
 * they returned the row.
 */
type ActualQuestionRow = Flat<
  Omit<Question, 'subject' | 'exam' | 'tag' | 'concept' | 'children' | 'type'> & { type: string }
>;

/**
 * Compile-time only; `npm run typecheck` is what enforces it.
 *
 * The last route group, and the one with three gates: `adminAuth`
 * covers it and checks POST/PUT/DELETE only, so the reads answer
 * without credentials; `/adaptive` adds requireUser; `/image/prompt` is
 * behind requireAdmin precisely because it would otherwise be an open
 * GET handing out a subject's whole concept list.
 *
 * Nothing in packages/shared describes `/count`, `/image`,
 * `/image/figure`, `/image/prompt`, `/{id}/enabled`, `/{id}/tag` or
 * `/{id}/concept`. The three types it does carry are each wrong in a
 * different way, below.
 */
describe('the question response schemas', () => {
  it('describe exactly what the embedded question shape is', () => {
    // Already pinned against `Question` in reply.contract.test.ts; here
    // it is the adaptive response, with every answer masked rather than
    // omitted, so the shape is unchanged.
    expectTypeOf<z.infer<typeof getQuestionAdaptiveResponseSchema>>().toEqualTypeOf<
      z.infer<typeof questionDetailSchema>[]
    >();
    expectTypeOf<GetQuestionAdaptiveResponse>().not.toEqualTypeOf<
      z.infer<typeof getQuestionAdaptiveResponseSchema>
    >();
  });

  it('and where shared is wrong, say exactly how', () => {
    // A row, with no relations: those are five separate endpoints.
    expectTypeOf<z.infer<typeof questionRowSchema>>().toEqualTypeOf<ActualQuestionRow>();

    // GET /{id} adds the link ids and the sub-questions -- not the
    // `exam`, `tag` and `concept` objects `Question` claims.
    expectTypeOf<z.infer<typeof getQuestionByIdResponseSchema>>().toEqualTypeOf<
      Flat<
        ActualQuestionRow & {
          examId: number | null;
          tagIds: number[];
          conceptIds: number[];
          children: z.infer<typeof questionDetailChildSchema>[];
        }
      >
    >();
    expectTypeOf<GetQuestionIdResponse>().not.toEqualTypeOf<
      z.infer<typeof getQuestionByIdResponseSchema>
    >();

    // The admin list is not `Question` either, and its `subject` is a
    // **name**: a client reading `question.subject.name` gets undefined.
    expectTypeOf<z.infer<typeof adminQuestionRowSchema>>().toEqualTypeOf<
      Flat<
        Pick<
          ActualQuestionRow,
          'id' | 'subjectId' | 'type' | 'content' | 'options' | 'answer' | 'difficulty' | 'isGroup' | 'enabled'
        > & { subject: string; childCount: number; categories: string[] }
      >
    >();
    expectTypeOf<Paginate<Question>>().not.toEqualTypeOf<
      z.infer<typeof getQuestionListResponseSchema>
    >();

    // And POST / is nested: one array per submitted question, holding
    // the question and then its children. `PostQuestionResponse` is
    // `Question[]`, one dimension short -- a client writing
    // `created[0].id` reads an array, not a number.
    expectTypeOf<z.infer<typeof postQuestionResponseSchema>>().toEqualTypeOf<
      ActualQuestionRow[][]
    >();
    expectTypeOf<PostQuestionResponse>().not.toEqualTypeOf<
      z.infer<typeof postQuestionResponseSchema>
    >();
  });
});
