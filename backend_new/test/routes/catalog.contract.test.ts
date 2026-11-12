import type {
  Category,
  Concept,
  ConceptGroup,
  Exam,
  Subject,
  Tag,
} from '@castor/shared';
import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import { categorySchema } from 'src/routes/category';
import { examSchema } from 'src/routes/exam';
import { getSubjectByIdResponseSchema, subjectSchema } from 'src/routes/subject';

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
 * Compile-time only; `npm run typecheck` is what enforces it.
 *
 * The admin catalog: categories, subjects, exams. Two things are worth
 * knowing before reading the assertions.
 *
 * First, the list responses are pinned against nothing, because
 * packages/shared describes none of them. `GET /api/subject` sends a
 * `categories` CSV summary and `GET /api/exam` a `subjects` one, and
 * both shapes are declared privately in the client component that reads
 * them (`SubjectDto` in SubjectClient.tsx, `ExamDto` in ExamClient.tsx)
 * -- a fifth place a response shape is written down. Step D replaces
 * those with the generated types too.
 *
 * Second, `Subject`, `Exam`, `Tag` and `ConceptGroup` are imported by
 * nothing in the webapp (only `Category` of this group is), which is
 * visible in how wrong they are: each claims relations the API has never
 * sent, including mutually recursive ones (`Exam.subject: Subject[]`,
 * whose `Subject.exams: Exam[]` comes straight back). Nothing checked
 * them because nothing used them. The assertions below state the real
 * shapes against those types anyway, so the gap is written down until
 * the sunset deletes both sides.
 */
describe('the catalog response schemas', () => {
  it('describe exactly what the webapp is typed against, where it is', () => {
    // The one type of this group the webapp actually imports.
    expectTypeOf<z.infer<typeof categorySchema>>().toEqualTypeOf<Category>();
  });

  it('and where shared overstates them, say exactly how', () => {
    // An exam is its own three columns. `Exam.subject: Subject[]` has
    // never been part of any response -- the subjects are a separate
    // call, GET /api/exam/{id}/subject, which sends ids only.
    expectTypeOf<z.infer<typeof examSchema>>().toEqualTypeOf<
      Pick<Exam, 'id' | 'name' | 'createdAt'>
    >();
    expectTypeOf<Exam>().not.toEqualTypeOf<z.infer<typeof examSchema>>();

    // POST and PUT /api/subject answer with the row and no relations,
    // although PostSubjectResponse is the full Subject.
    expectTypeOf<z.infer<typeof subjectSchema>>().toEqualTypeOf<
      Pick<Subject, 'id' | 'name' | 'sortOrder' | 'createdAt'>
    >();

    // GET /api/subject/{id} does carry three of the five relations
    // Subject claims -- and each of them trimmed to an id and a name,
    // which is what the pickers in the admin UI use. `category` and
    // `filterOptions` are not there at all: the categories are a
    // separate call (GET /api/subject/{id}/category, ids only) and the
    // filter options hang off the category, not the subject.
    expectTypeOf<z.infer<typeof getSubjectByIdResponseSchema>>().toEqualTypeOf<
      Flat<
        Pick<Subject, 'id' | 'name' | 'sortOrder' | 'createdAt'> & {
          exams: Pick<Exam, 'id' | 'name'>[];
          tags: Pick<Tag, 'id' | 'name'>[];
          conceptGroups: Flat<
            Pick<ConceptGroup, 'id' | 'name'> & { concepts: Pick<Concept, 'id' | 'name'>[] }
          >[];
        }
      >
    >();
    expectTypeOf<Subject>().not.toEqualTypeOf<z.infer<typeof getSubjectByIdResponseSchema>>();
  });
});
