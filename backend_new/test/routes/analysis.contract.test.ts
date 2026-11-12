import type {
  DailyMastery,
  ForgettingRiskItem,
  GetAnalysisOverviewResponse,
  MasteryProgress,
  SpeedComparison,
  SubjectHistory,
} from '@castor/shared';
import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import {
  dailyMasterySchema,
  forgettingRiskItemSchema,
  getAnalysisOverviewResponseSchema,
  speedComparisonSchema,
} from 'src/routes/analysis';

/**
 * Compile-time only; `npm run typecheck` is what enforces it.
 *
 * The subscriber-only analysis page: one route, three sections, behind
 * requireUser *and* requireSubscription. Every type matches, which fits
 * the pattern -- this is a page that was built against these shapes, so
 * they were read.
 *
 * The one thing that did not match was `lastAttemptAt`, a Date spread
 * out of `user_concept_stat` while the type said string. Fixed by
 * listing the fields instead of spreading the row, which is also what
 * keeps a new column on that table out of a paid response.
 */
describe('the analysis response schemas', () => {
  it('describe exactly what the webapp is typed against', () => {
    expectTypeOf<z.infer<typeof dailyMasterySchema>>().toEqualTypeOf<DailyMastery>();
    expectTypeOf<z.infer<typeof forgettingRiskItemSchema>>().toEqualTypeOf<ForgettingRiskItem>();
    expectTypeOf<z.infer<typeof speedComparisonSchema>>().toEqualTypeOf<SpeedComparison>();
    expectTypeOf<
      z.infer<typeof getAnalysisOverviewResponseSchema>['progress']
    >().toEqualTypeOf<MasteryProgress>();
    expectTypeOf<
      z.infer<typeof getAnalysisOverviewResponseSchema>['progress']['subjects'][number]
    >().toEqualTypeOf<SubjectHistory>();
    expectTypeOf<
      z.infer<typeof getAnalysisOverviewResponseSchema>
    >().toEqualTypeOf<GetAnalysisOverviewResponse>();
  });
});
