import type {
  GetInfoDonationResponse,
  GetInfoPlansResponse,
  GetInfoPopularResponse,
  GetInfoStatsResponse,
} from '@castor/shared';
import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import {
  getInfoDonationResponseSchema,
  getInfoPlansResponseSchema,
  getInfoPopularResponseSchema,
  getInfoStatsResponseSchema,
} from 'src/routes/info';

/**
 * Flattens an intersection into a plain object type.
 *
 * `expectTypeOf(...).toEqualTypeOf` compares how a type is written, not
 * only what shape it is: `Paginate<T> & { summary: S }` and the single
 * object with all those keys are the same shape and not the same type to
 * it. The schemas infer flat objects, so the expected side is flattened
 * to match.
 */
type Flat<T> = { [K in keyof T]: T[K] };

/**
 * Compile-time only; `npm run typecheck` is what enforces it.
 *
 * Every response in this group matches what packages/shared claims --
 * unlike the user routes, where four did not. These are the public
 * endpoints the landing page and the pricing page read, which is
 * probably why: they were written against a page that would have looked
 * wrong immediately.
 *
 * GET /api/info itself has no shared type to pin. It is the health
 * check, read by the load balancer and by nothing the webapp compiles.
 */
describe('the info response schemas', () => {
  it('describe exactly what the webapp is typed against', () => {
    expectTypeOf<z.infer<typeof getInfoPlansResponseSchema>>().toEqualTypeOf<GetInfoPlansResponse>();
    expectTypeOf<z.infer<typeof getInfoStatsResponseSchema>>().toEqualTypeOf<GetInfoStatsResponse>();
    expectTypeOf<
      z.infer<typeof getInfoPopularResponseSchema>
    >().toEqualTypeOf<GetInfoPopularResponse>();
    expectTypeOf<z.infer<typeof getInfoDonationResponseSchema>>().toEqualTypeOf<
      Flat<GetInfoDonationResponse>
    >();
  });
});
