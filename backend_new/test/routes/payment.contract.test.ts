import type {
  DayPassPurchase,
  GetPaymentPurchasesResponse,
  PostPaymentCheckoutResponse,
} from '@castor/shared';
import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import {
  dayPassPurchaseSchema,
  getPaymentPurchasesResponseSchema,
  postPaymentCheckoutResponseSchema,
} from 'src/routes/payment';

/**
 * Flattens an intersection into a plain object type.
 *
 * `expectTypeOf(...).toEqualTypeOf` compares how a type is written, not
 * only what shape it is: `A & B` and the single object with all those
 * keys are the same shape and not the same type to it.
 */
type Flat<T> = { [K in keyof T]: T[K] };

/**
 * Compile-time only; `npm run typecheck` is what enforces it.
 *
 * Both routes are behind requireUser. Neither describes anything
 * secret, because neither sends anything secret: the checkout response
 * carries the form fields ECPay expects, `CheckMacValue` among them,
 * and that value is a signature *over* those fields. The HashKey and
 * HashIV it is computed with never leave the server and appear in no
 * schema, no description and not in openapi.json.
 */
describe('the payment response schemas', () => {
  it('describe exactly what the webapp is typed against', () => {
    expectTypeOf<
      z.infer<typeof postPaymentCheckoutResponseSchema>
    >().toEqualTypeOf<PostPaymentCheckoutResponse>();
  });

  /**
   * The second place in this API where **shared is narrower than the
   * data supports** -- the first was `question.type`.
   *
   * `choose_payment` and `status` are varchar columns. The sets really
   * are closed in practice (payment_purchase is written by this backend
   * alone, always through the exported constants), but the database
   * does not hold them, so a response cannot promise one. A `z.enum`
   * here was rejected by `satisfies` on the handler, which is the guard
   * working: the honest type is the one the document carries, and the
   * values are in the field descriptions instead.
   */
  it('and where shared is narrower than the column, say so', () => {
    expectTypeOf<z.infer<typeof dayPassPurchaseSchema>>().toEqualTypeOf<
      Flat<
        Omit<DayPassPurchase, 'choosePayment' | 'status'> & {
          choosePayment: string;
          status: string;
        }
      >
    >();
    expectTypeOf<DayPassPurchase>().not.toEqualTypeOf<z.infer<typeof dayPassPurchaseSchema>>();
    expectTypeOf<GetPaymentPurchasesResponse>().not.toEqualTypeOf<
      z.infer<typeof getPaymentPurchasesResponseSchema>
    >();
  });
});
