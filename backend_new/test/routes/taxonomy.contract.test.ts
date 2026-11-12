import type {
  Concept,
  ConceptGroup,
  FilterDimension,
  FilterOption,
  PostConceptGroupResponse,
  PostConceptResponse,
  PostTagResponse,
  Tag,
} from '@castor/shared';
import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import { conceptSchema } from 'src/routes/concept';
import { conceptGroupSchema } from 'src/routes/conceptGroup';
import { filterDimensionSchema } from 'src/routes/filterDimension';
import { filterOptionSchema } from 'src/routes/filterOption';
import { tagSchema } from 'src/routes/tag';

/**
 * Flattens an intersection into a plain object type.
 *
 * `expectTypeOf(...).toEqualTypeOf` compares how a type is written, not
 * only what shape it is: `A & B` and the single object with all those
 * keys are the same shape and not the same type to it. The schemas infer
 * flat objects, so the expected side is flattened to match.
 */
type Flat<T> = { [K in keyof T]: T[K] };

/**
 * Compile-time only; `npm run typecheck` is what enforces it.
 *
 * The taxonomy behind a question: concept groups and their concepts, the
 * per-subject tags, and the two-level filter surface a category offers.
 * Five admin CRUD groups of the same shape, and the same split as the
 * catalog groups: every read answers without credentials (`adminAuth`
 * gates writes only), every write is admin-only.
 *
 * The list responses are pinned against nothing, because
 * packages/shared describes none of them -- `GET /api/filter-option`'s
 * `subjects` CSV summary least of all.
 */
describe('the taxonomy response schemas', () => {
  it('describe exactly what the webapp is typed against, where it is', () => {
    // The one type here that is simply right: four fields, no invented
    // relation. It is also the only one of the five with no timestamp,
    // because filter_dimension has no created_at column.
    expectTypeOf<z.infer<typeof filterDimensionSchema>>().toEqualTypeOf<FilterDimension>();
  });

  /**
   * Four of the five shared types carry a relation the API has never
   * sent -- an embedded parent object, or the children. The admin UI
   * resolves every one of them from a list it fetches separately, which
   * is why none of this was ever noticed: nothing imports these types
   * (see test/routes/catalog.contract.test.ts for the same finding about
   * Subject and Exam).
   *
   * Spelled out with Omit over the shared types rather than described in
   * a comment, so each gap is a thing the compiler checks: if a response
   * is ever completed, one of these fails and has to be re-stated.
   */
  it('and where shared invents relations, say exactly which', () => {
    // Concept claims the group object; the response carries its id.
    expectTypeOf<z.infer<typeof conceptSchema>>().toEqualTypeOf<Omit<Concept, 'conceptGroup'>>();
    expectTypeOf<PostConceptResponse>().not.toEqualTypeOf<z.infer<typeof conceptSchema>>();

    // ConceptGroup claims both its subject and its concepts. The
    // concepts do exist in one response -- GET /api/subject/{id}
    // bundles them -- but never in this group's own.
    expectTypeOf<z.infer<typeof conceptGroupSchema>>().toEqualTypeOf<
      Omit<ConceptGroup, 'subject' | 'concepts'>
    >();
    expectTypeOf<PostConceptGroupResponse>().not.toEqualTypeOf<
      z.infer<typeof conceptGroupSchema>
    >();

    // Tag claims its subject.
    expectTypeOf<z.infer<typeof tagSchema>>().toEqualTypeOf<Omit<Tag, 'subject'>>();
    expectTypeOf<PostTagResponse>().not.toEqualTypeOf<z.infer<typeof tagSchema>>();

    // FilterOption is the odd one: it does not merely add a relation,
    // it has the wrong field. There is no `dimension` object in any
    // response and no `dimensionId` in the type, so a client written
    // against it would read undefined and have nothing to group by.
    expectTypeOf<z.infer<typeof filterOptionSchema>>().toEqualTypeOf<
      Flat<Omit<FilterOption, 'dimension'> & { dimensionId: number }>
    >();
    expectTypeOf<FilterOption>().not.toEqualTypeOf<z.infer<typeof filterOptionSchema>>();
  });
});
