import type {
  AdminUser,
  Category,
  GetUserHistoryResponse,
  GetUserStatsResponse,
  Paginate,
  PostUserSyncResponse,
  StatsSubject,
  SubscriptionStatus,
  User,
} from '@castor/shared';
import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import {
  getUserHistoryResponseSchema,
  getUserListResponseSchema,
  getUserStatsResponseSchema,
  postUserSyncResponseSchema,
  userSchema,
} from 'src/routes/user';

/**
 * Flattens an intersection into a plain object type.
 *
 * `expectTypeOf(...).toEqualTypeOf` compares how a type is written, not
 * only what shape it is: `User & { subscription: X }` and the single
 * object with all those keys are the same shape and not the same type to
 * it. The schemas infer flat objects, so the expected sides below are
 * flattened to match.
 */
type Flat<T> = { [K in keyof T]: T[K] };

/**
 * Compile-time only; `npm run typecheck` is what enforces it.
 */
describe('the user response schemas', () => {
  it('describe exactly what the webapp is typed against', () => {
    expectTypeOf<z.infer<typeof userSchema>>().toEqualTypeOf<User>();
    expectTypeOf<
      z.infer<typeof getUserHistoryResponseSchema>
    >().toEqualTypeOf<GetUserHistoryResponse>();
  });

  /**
   * Three responses in this file send less than packages/shared claims,
   * and have since they were written -- nothing ever compared the two.
   *
   * Spelled out with Omit over the shared types rather than described in
   * a comment, so each gap is a thing the compiler checks: if a response
   * is ever completed (or trimmed further), one of these fails and has
   * to be re-stated. The schemas are the honest side, so the generated
   * document is right and these types are what the webapp will get when
   * it stops using the hand-written ones.
   *
   * None of the three is a live bug today -- see AGENTS.md for which
   * fields cost what, and for why the admin listing leaves two out
   * deliberately.
   */
  it('and where they do not, say exactly how they differ', () => {
    // The admin listing: billing only, no entitled and no autoRenew.
    expectTypeOf<z.infer<typeof getUserListResponseSchema>>().toEqualTypeOf<
      Paginate<Flat<User & { subscription: Omit<SubscriptionStatus, 'entitled' | 'autoRenew'> }>>
    >();
    expectTypeOf<Paginate<AdminUser>>().not.toEqualTypeOf<
      z.infer<typeof getUserListResponseSchema>
    >();

    // Sign-in: entitled is there, autoRenew is not.
    expectTypeOf<z.infer<typeof postUserSyncResponseSchema>>().toEqualTypeOf<
      Flat<User & { subscription: Omit<SubscriptionStatus, 'autoRenew'> }>
    >();
    expectTypeOf<PostUserSyncResponse>().not.toEqualTypeOf<
      z.infer<typeof postUserSyncResponseSchema>
    >();

    // Mastery per subject: the categories carry no createdAt.
    expectTypeOf<z.infer<typeof getUserStatsResponseSchema>>().toEqualTypeOf<
      Flat<Omit<StatsSubject, 'category'> & { category: Omit<Category, 'createdAt'>[] }>[]
    >();
    expectTypeOf<GetUserStatsResponse>().not.toEqualTypeOf<
      z.infer<typeof getUserStatsResponseSchema>
    >();
  });
});
