import { and, gt, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm';
import { paymentPurchaseTable } from 'src/db/schema';

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

/**
 * It can no longer be paid: a code whose deadline passed, or a checkout
 * nothing ever came back from.
 *
 * Terminal by convention rather than by guard. Only `paid` short-circuits
 * the two webhook handlers, so a notification arriving after this was set
 * still grants the days -- deliberately: if ECPay says the money moved it
 * moved, and `expired` was only ever our own inference. ECPay sends no
 * notification of an expiry.
 */
export const PURCHASE_STATUS_EXPIRED = 'expired';

/** ECPay reported the payment as failed. Terminal in the same sense. */
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

/**
 * How long a checkout nothing has come back from is still believed live.
 *
 * `created` says a signed form was handed to the browser. Whether that
 * tab is still open is not knowable here: ECPay issues no code for a card
 * payment, so there is no deadline to store, and it never tells us that
 * an abandoned checkout was abandoned. This stands in for the deadline.
 *
 * It has to exist, because a state with no deadline cannot be left for
 * anything to ask about later. Without it a `created` row stays open for
 * good, and the checkout guard below refused a card payer who closed the
 * tab a recurring agreement permanently -- behind "請稍後再試".
 *
 * Thirty minutes is longer than anyone spends on ECPay's page, and being
 * wrong this way is cheap: a payment landing after the window is still
 * granted in full by `recordDayPassPayment`, and
 * `cancelOrdersSupersededByDayPass` stops the agreement that night. Being
 * wrong the other way is the lockout above.
 */
export const PURCHASE_CHECKOUT_WINDOW_MINUTES = 30;

const windowStart = (now: Date) =>
  new Date(now.getTime() - PURCHASE_CHECKOUT_WINDOW_MINUTES * 60 * 1000);

/**
 * Money could still arrive for this purchase.
 *
 * What a caller wanting to know "is this user mid-payment" has to ask.
 * `PURCHASE_STATUSES_OPEN` alone cannot answer it: the statuses carry no
 * deadline, so asking for them made the question depend on the nightly
 * sweep having run first.
 *
 * Every comparison keeps a column on the left and the moment on the
 * right, deliberately. Written the other way round -- `coalesce(expire_at,
 * created_at + interval 30 minute) > ?` -- it reads better and is wrong:
 * drizzle serialises a Date through the mapper of the column it is
 * compared against, which writes UTC, while a Date bound into a raw `sql`
 * fragment has no column to borrow and goes to mysql2, which formats it
 * in the Lambda's local zone. The gap is the UTC offset, wide enough to
 * swallow the entire window, and nothing in a ±1-day test fixture would
 * have shown it.
 *
 * `isNull` / `isNotNull` are explicit for a related reason: an OR with a
 * NULL arm evaluates to NULL rather than false, and a row that answers
 * NULL to both this and `purchaseTimedOut` is neither open nor closable
 * -- the exact shape of the bug this replaces.
 */
export const purchaseStillOpen = (now: Date) =>
  and(
    inArray(paymentPurchaseTable.status, [...PURCHASE_STATUSES_OPEN]),
    or(
      // A code was issued and ECPay told us when it stops being payable.
      and(isNotNull(paymentPurchaseTable.expireAt), gt(paymentPurchaseTable.expireAt, now)),
      // Nothing was issued, so the checkout window stands in for it.
      and(
        isNull(paymentPurchaseTable.expireAt),
        isNotNull(paymentPurchaseTable.createdAt),
        gt(paymentPurchaseTable.createdAt, windowStart(now))
      )
    )
  );

/**
 * The complement: open in name only, with its deadline behind it.
 *
 * Exactly the rows `purchaseStillOpen` does not match, so a row the sweep
 * closes is one the guard had already stopped counting and the sweep is
 * cosmetic rather than load-bearing. The two are kept honest by the cases
 * either side of each boundary in regression/routes, not by sharing an
 * expression -- see the note above about why the obvious shared one is a
 * timezone bug.
 */
export const purchaseTimedOut = (now: Date) =>
  and(
    inArray(paymentPurchaseTable.status, [...PURCHASE_STATUSES_OPEN]),
    or(
      and(isNotNull(paymentPurchaseTable.expireAt), lte(paymentPurchaseTable.expireAt, now)),
      and(
        isNull(paymentPurchaseTable.expireAt),
        or(
          isNull(paymentPurchaseTable.createdAt),
          lte(paymentPurchaseTable.createdAt, windowStart(now))
        )
      )
    )
  );
