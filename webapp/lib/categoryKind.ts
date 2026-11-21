import type { CategoryKind } from '@/types/api'

/**
 * Laying categories out under the exam families the server defined.
 *
 * There is deliberately **no list of families in this file**. The codes, the
 * Chinese labels and the order all come from `GET /api/category/kind`, so a
 * fourth family is a backend change and this module keeps working untouched.
 * The webapp used to hold its own copy of the three, which is exactly why the
 * national and licence cards were five disabled buttons: the page had nowhere
 * to put a kind it did not already know about.
 *
 * `CategoryKind` is the generated type, not one written here: it comes from
 * the `CategoryKind` schema in backend_new/openapi.json via
 * webapp/types/openapi.d.ts, so this module cannot compile against a shape
 * the endpoint does not send. A hand-written copy sat here until 2026-11-21
 * and broke the rule in AGENTS.md -- worse, it typechecked happily while
 * nothing confirmed the generated document had the schema at all.
 */

export type CategoryGroup<T> = {
  kind: CategoryKind
  categories: T[]
}

/**
 * Groups categories under the families, in the server's order.
 *
 * Two properties worth keeping:
 *
 * - **An empty family still gets a group.** The card or tab has to render
 *   regardless, as "尚未開放"; dropping it would make a family disappear the
 *   moment its last category was deleted.
 * - **A category whose kind is in no family still gets one.** It can only
 *   arrive from hand-run SQL, since the API validates writes against the same
 *   catalogue -- but a row that renders under no heading at all is the
 *   failure this whole feature exists to remove, so it is grouped last under
 *   its own raw code rather than silently dropped.
 */
export const groupCategoriesByKind = <T extends { kind: string }>(
  kinds: CategoryKind[],
  categories: T[]
): CategoryGroup<T>[] => {
  const ordered = [...kinds].sort((a, b) => a.sortOrder - b.sortOrder)
  const groups = new Map<string, CategoryGroup<T>>(
    ordered.map((kind) => [kind.code, { kind, categories: [] }])
  )

  for (const category of categories) {
    const existing = groups.get(category.kind)
    if (existing) {
      existing.categories.push(category)
      continue
    }
    // Unknown code: its own group, labelled with the code itself, appended
    // after the known families because the server did not rank it.
    groups.set(category.kind, {
      kind: {
        code: category.kind,
        name: category.kind,
        sortOrder: Number.MAX_SAFE_INTEGER,
      },
      categories: [category],
    })
  }

  return [...groups.values()]
}

/**
 * The family whose panel is showing, given what the draft restored.
 *
 * Returns the first family when the stored code names one the server no
 * longer serves, and an empty string before the catalogue has arrived -- so
 * the tab strip never highlights a tab that is not there.
 */
export const resolveActiveKind = (kinds: CategoryKind[], active: string): string => {
  if (kinds.some((kind) => kind.code === active)) return active
  const ordered = [...kinds].sort((a, b) => a.sortOrder - b.sortOrder)
  return ordered[0]?.code ?? ''
}
