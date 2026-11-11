import type { GetGuardianResponse, PostGuardianInvestResponse } from '@castor/shared';
import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import { getGuardianResponseSchema, postGuardianInvestResponseSchema } from 'src/routes/guardian';

/**
 * The bridge between the schema and the type the webapp is built against.
 *
 * `packages/shared` describes these responses by hand, and until now
 * nothing checked that description against the server -- no route
 * imported it, so the "contract" was a claim the webapp trusted. The
 * route now carries a zod schema that its handler's return is checked
 * against and that the OpenAPI document is generated from, and this is
 * what ties the two together: if the schema and the hand-written type
 * ever describe different shapes, `npm run typecheck` fails here.
 *
 * It is also what makes the eventual swap safe. When the webapp moves
 * from the hand-written types to ones generated from the document, the
 * generated types will be these schemas -- and this test says they are
 * already the same shapes, so that swap changes no types at all.
 *
 * These are compile-time assertions with no runtime behaviour, which is
 * why this file lives in test/ rather than regression/: the suite that
 * runs it needs no database.
 */
describe('the guardian response schemas', () => {
  it('describe exactly what the webapp is typed against', () => {
    expectTypeOf<z.infer<typeof getGuardianResponseSchema>>().toEqualTypeOf<GetGuardianResponse>();
    expectTypeOf<
      z.infer<typeof postGuardianInvestResponseSchema>
    >().toEqualTypeOf<PostGuardianInvestResponse>();
  });
});
