import type {
  CharityCategoryRow,
  CharityOrganization,
  GetCharityCategoriesResponse,
  GetCharityOrganizationResponse,
  GetStoreSpeciesResponse,
  GetWalletResponse,
  GuardianSpecies,
  Paginate,
  PointTransaction,
  PostStoreRedeemResponse,
  PutCharityOrganizationCategoryResponse,
} from '@castor/shared';
import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import {
  charityCategoryRowSchema,
  getCharityCategoryListResponseSchema,
} from 'src/routes/charityCategory';
import {
  charityOrganizationSchema,
  getCharityOrganizationListResponseSchema,
  putCharityOrganizationCategoryResponseSchema,
} from 'src/routes/charityOrganization';
import {
  getStoreSpeciesResponseSchema,
  guardianSpeciesSchema,
  postStoreRedeemResponseSchema,
} from 'src/routes/store';
import { getWalletResponseSchema, pointTransactionSchema } from 'src/routes/wallet';

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
 * The charity directory, the point ledger and the egg shop. Three
 * different gates in one file, which is the point of stating each
 * route's own: the charity groups are behind `adminAuth` (reads open,
 * writes admin), wallet and store behind `requireUser`, and the admin
 * species catalog behind `requireAdmin` -- deliberately, since it is
 * GET-only and `adminAuth` would gate nothing.
 *
 * `GET /api/species` is pinned against nothing: packages/shared does not
 * describe it, and the admin page that reads it declares its own shape
 * (`SpeciesClient.tsx`). Its `ownersByLevel` was typed
 * `Record<number, number>` in the handler, which no JSON response can
 * be -- object keys are strings -- so the schema says `Record<string,
 * number>` and the handler now agrees.
 */
describe('the charity, wallet and store response schemas', () => {
  it('describe exactly what the webapp is typed against', () => {
    expectTypeOf<z.infer<typeof charityCategoryRowSchema>>().toEqualTypeOf<
      Flat<CharityCategoryRow>
    >();
    // `GetCharityCategoriesResponse` is `Paginate<CharityCategoryRow>`,
    // which is this with the intersection left unflattened -- the same
    // shape, and not the same type to `toEqualTypeOf`. Hence Flat here
    // rather than the alias itself.
    expectTypeOf<z.infer<typeof getCharityCategoryListResponseSchema>>().toEqualTypeOf<
      Paginate<Flat<CharityCategoryRow>>
    >();
    expectTypeOf<Flat<GetCharityCategoriesResponse['data'][number]>>().toEqualTypeOf<
      z.infer<typeof charityCategoryRowSchema>
    >();

    // Including `categories`, which really is the full CharityCategory
    // ({ id, code, name }) that shared claims -- not every relation in
    // this repo is a fiction.
    expectTypeOf<z.infer<typeof charityOrganizationSchema>>().toEqualTypeOf<CharityOrganization>();
    expectTypeOf<
      z.infer<typeof getCharityOrganizationListResponseSchema>
    >().toEqualTypeOf<GetCharityOrganizationResponse>();
    expectTypeOf<
      z.infer<typeof putCharityOrganizationCategoryResponseSchema>
    >().toEqualTypeOf<PutCharityOrganizationCategoryResponse>();

    expectTypeOf<z.infer<typeof pointTransactionSchema>>().toEqualTypeOf<PointTransaction>();
    expectTypeOf<z.infer<typeof getWalletResponseSchema>>().toEqualTypeOf<GetWalletResponse>();

    expectTypeOf<
      z.infer<typeof postStoreRedeemResponseSchema>
    >().toEqualTypeOf<PostStoreRedeemResponse>();
  });

  /**
   * The first gap found in this direction: the response sends *more*
   * than the type admits, rather than less.
   *
   * `GuardianSpecies` has no `level`, and the one caller needed it --
   * the collection view shows progress per species and sorts the
   * started ones first -- so `BoxClient.tsx` declares its own
   * `SpeciesDto` with the field and ignores the shared type. A
   * hand-written type that is missing something is worked around
   * silently; one that overstates is not noticed at all. Neither gets
   * fixed while nothing compares it to the server.
   */
  it('and where shared understates them, say exactly what is missing', () => {
    expectTypeOf<z.infer<typeof guardianSpeciesSchema>>().toEqualTypeOf<
      Flat<GuardianSpecies & { level: number | null }>
    >();
    expectTypeOf<GuardianSpecies>().not.toEqualTypeOf<z.infer<typeof guardianSpeciesSchema>>();
    expectTypeOf<GetStoreSpeciesResponse>().not.toEqualTypeOf<
      z.infer<typeof getStoreSpeciesResponseSchema>
    >();
  });
});
