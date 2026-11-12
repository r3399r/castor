import type {
  GetSubscriptionHistoryResponse,
  PostSubscriptionCancelResponse,
  SubscriptionStatus,
} from '@castor/shared';
import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import {
  getSubscriptionHistoryResponseSchema,
  subscriptionStatusSchema,
} from 'src/routes/subscription';

/**
 * Compile-time only; `npm run typecheck` is what enforces it.
 *
 * The status shape is worth pinning harder than most: four responses
 * report it, and the three booleans mean three different things that
 * this codebase has already confused once in each direction.
 */
describe('the subscription response schemas', () => {
  it('describe exactly what the webapp is typed against', () => {
    // GET /me has no name of its own in packages/shared -- the webapp
    // imports SubscriptionStatus directly, which is the shape it is.
    expectTypeOf<z.infer<typeof subscriptionStatusSchema>>().toEqualTypeOf<SubscriptionStatus>();
    expectTypeOf<
      z.infer<typeof subscriptionStatusSchema>
    >().toEqualTypeOf<PostSubscriptionCancelResponse>();
    expectTypeOf<
      z.infer<typeof getSubscriptionHistoryResponseSchema>
    >().toEqualTypeOf<GetSubscriptionHistoryResponse>();
  });
});
