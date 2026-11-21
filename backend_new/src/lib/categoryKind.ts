/**
 * The exam families a category can belong to, in display order.
 *
 * **This list is the definition.** `GET /api/category/kind` serves it, and
 * /adaptive renders one card per entry, in this order, labelled with `name`.
 * No frontend file names a family, so adding one cannot leave a category
 * with nowhere to render.
 *
 * Adding a fourth, measured rather than guessed:
 *
 *   1. an entry here, and one in CATEGORY_KIND_NAMES -- the `Record` makes
 *      the second mandatory, so a missing label is a compile error, not a
 *      blank heading;
 *   2. `npm run openapi` -- two route descriptions interpolate this list, so
 *      the committed document drifts and CI's drift check fails;
 *   3. one regression assertion, `GET /kind > serves the exam families in
 *      display order`, which pins the catalogue on purpose. Nothing else in
 *      207 unit, 36 category-regression or 154 webapp tests notices;
 *   4. the two `repeat(3, ...)` in adaptive.module.css if the layout should
 *      not wrap -- `.examGrid` puts a fourth card alone on a second row and
 *      `.examTabs` orphans a fourth tab. Both read as sloppy rather than
 *      broken, and widening them squeezes the two-column option grid inside
 *      each card, so it is a design call and not part of adding a family.
 *
 * So: two lines, a regenerate, one test, and a CSS decision. Not one line.
 *
 * That is the whole point of this file. The webapp used to hold its own copy
 * of the three codes and their Chinese labels, and the two it had no data for
 * were five disabled buttons: a national-exam category created in /admin
 * could not appear anywhere, because the page had nowhere to put a kind it
 * did not already know about.
 *
 * A constant rather than a seeded table, unlike `charity_category`: nothing
 * joins to these, no admin page owns them, and `category.kind` stores the
 * code as a plain varchar. If they ever have to change without a deploy, this
 * becomes a table -- and then the frontend still needs no change, which is
 * the property worth keeping.
 */
export const CATEGORY_KINDS = ['admission', 'national', 'license'] as const;

export type CategoryKind = (typeof CATEGORY_KINDS)[number];

/**
 * What a category created with no kind becomes. Must stay a member of
 * CATEGORY_KINDS, and must stay equal to `category.kind`'s column DEFAULT --
 * the two are independent copies, and a row written by hand in SQL takes the
 * column's.
 */
export const DEFAULT_CATEGORY_KIND: CategoryKind = 'admission';

const CATEGORY_KIND_NAMES: Record<CategoryKind, string> = {
  admission: '入學考試',
  national: '國家考試',
  license: '專技證照',
};

export type CategoryKindEntry = {
  code: string;
  name: string;
  sortOrder: number;
};

/**
 * The catalogue as the API serves it.
 *
 * `sortOrder` is stated rather than left to the array's order: a generated
 * client type cannot express "this array is ordered", and a client that
 * re-sorts for any reason would otherwise have nothing to sort by.
 */
export const categoryKindCatalogue = (): CategoryKindEntry[] =>
  CATEGORY_KINDS.map((code, index) => ({
    code,
    name: CATEGORY_KIND_NAMES[code],
    sortOrder: index + 1,
  }));
