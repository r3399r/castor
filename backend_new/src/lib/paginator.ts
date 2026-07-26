export type Pagination = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export const DEFAULT_LIMIT = 20;
// High enough that "fetch everything for a dropdown" (categories for the
// subject relation editor, subjects for exam/tag/concept-group pickers)
// can just pass this as limit instead of needing a separate unpaginated
// mode -- there's no realistic admin dataset near this size yet.
export const MAX_LIMIT = 1000;

// Matches the legacy backend's convention (src/utils/paginator.ts there):
// callers pass limit/offset, not a page number, and this derives the
// 1-indexed page for display. totalPages is floored at 1 so an empty
// result reads as "page 1 of 1" rather than "of 0".
export const genPagination = (
  total: number,
  limit: number,
  offset: number
): Pagination => ({
  total,
  page: Math.floor(offset / limit) + 1,
  limit,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});
