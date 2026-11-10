/**
 * The states a one-time day-pass purchase moves through.
 *
 * Its own module for the same reason `paymentOrder.ts` is: these strings
 * are compared in the checkout route, in two webhook handlers and in the
 * housekeep sweep, and a second copy of one of them is a bug that shows
 * up as a purchase nobody can find.
 */

/** Form handed to the browser. Nothing is reserved; the tab may just close. */
export const PURCHASE_STATUS_CREATED = 'created';

/**
 * ECPay issued a code or virtual account and told us through
 * PaymentInfoURL. **The money has not arrived.** For ATM, CVS and
 * BARCODE this is where the row spends most of its life -- up to the
 * seven days the code stays payable. A card payment never enters it.
 */
export const PURCHASE_STATUS_AWAITING = 'awaiting';

/** Payment confirmed and the days granted. Terminal. */
export const PURCHASE_STATUS_PAID = 'paid';

/** The code's deadline passed with no payment. Terminal. */
export const PURCHASE_STATUS_EXPIRED = 'expired';

/** ECPay reported the payment as failed. Terminal. */
export const PURCHASE_STATUS_FAILED = 'failed';

/**
 * Statuses that may still become `paid`.
 *
 * `created` is included on purpose: a credit-card payment goes straight
 * from `created` to `paid` without an intervening PaymentInfoURL
 * notification, and an ATM notification can in principle be overtaken by
 * the payment one if ECPay retries the first.
 */
export const PURCHASE_STATUSES_OPEN = [
  PURCHASE_STATUS_CREATED,
  PURCHASE_STATUS_AWAITING,
] as const;
