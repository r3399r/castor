import type {
  Donation,
  DonationBatch,
  DonationBatchDetail,
  DonationBatchEvidence,
  GetDonationResponse,
  GetUnpaidDonationsResponse,
  Paginate,
  UnpaidDonation,
} from '@castor/shared';
import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import { donationSchema, getDonationResponseSchema } from 'src/routes/donation';
import {
  donationBatchDetailResponseSchema,
  donationBatchEvidenceSchema,
  donationBatchSchema,
  donationMemberSchema,
  getDonationBatchListResponseSchema,
  getUnpaidDonationsResponseSchema,
} from 'src/routes/donationBatch';

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
 * `DonationBatch` with its evidence items flattened too.
 *
 * `DonationBatchEvidence` is `DonationEvidence & { s3Key; sortOrder;
 * createdAt }`, and flattening the outer type does not reach inside an
 * array, so the items have to be flattened by name.
 */
type FlatBatch = Flat<
  Omit<DonationBatch, 'evidence'> & { evidence: Flat<DonationBatchEvidence>[] }
>;

/**
 * Compile-time only; `npm run typecheck` is what enforces it.
 *
 * The donation feature, both halves: what the person who gave sees
 * (`/api/donation`, behind requireUser and scoped to the caller) and
 * what the payout side sees (`/api/donation-batch`, behind requireAdmin
 * for every method -- GET /unpaid names which user owes which amount,
 * so `adminAuth` would have published per-user donation data).
 *
 * The third view of the same rows, the public record at
 * GET /api/info/donation, is pinned in its own place. It is the one that
 * carries no user id and no internal note.
 *
 * Every type here matches, which is worth saying after the catalog and
 * taxonomy groups: these are the shapes the donation screens were built
 * against while the feature was being written, so they were read.
 */
describe('the donation response schemas', () => {
  it("describe exactly what the giver's own record is typed against", () => {
    expectTypeOf<z.infer<typeof donationSchema>>().toEqualTypeOf<Donation>();
    expectTypeOf<z.infer<typeof getDonationResponseSchema>>().toEqualTypeOf<
      Flat<GetDonationResponse>
    >();
  });

  it('describe exactly what the payout side is typed against', () => {
    expectTypeOf<z.infer<typeof donationBatchEvidenceSchema>>().toEqualTypeOf<
      Flat<DonationBatchEvidence>
    >();
    expectTypeOf<z.infer<typeof donationMemberSchema>>().toEqualTypeOf<UnpaidDonation>();
    expectTypeOf<z.infer<typeof donationBatchSchema>>().toEqualTypeOf<FlatBatch>();
    expectTypeOf<z.infer<typeof donationBatchDetailResponseSchema>>().toEqualTypeOf<
      Flat<Omit<DonationBatchDetail, 'evidence'> & { evidence: Flat<DonationBatchEvidence>[] }>
    >();
    // `GetDonationBatchesResponse` is `Paginate<DonationBatch>`, which
    // is this with the evidence items left as intersections.
    expectTypeOf<z.infer<typeof getDonationBatchListResponseSchema>>().toEqualTypeOf<
      Paginate<FlatBatch>
    >();
    expectTypeOf<z.infer<typeof getUnpaidDonationsResponseSchema>>().toEqualTypeOf<
      Flat<GetUnpaidDonationsResponse>
    >();
  });
});
