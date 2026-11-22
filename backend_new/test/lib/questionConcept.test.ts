import { describe, expect, it } from 'vitest';
import { conceptIdsForReply } from 'src/lib/questionConcept';

const sorted = (set: Set<number>) => [...set].sort((a, b) => a - b);

describe('conceptIdsForReply', () => {
  it('credits only its own concepts for a standalone question', () => {
    // No parent, so nothing to subtract from and nothing to add.
    expect(sorted(conceptIdsForReply([1, 2], [], new Set()))).toEqual([1, 2]);
  });

  it("credits the parent's whole set when no child claims anything", () => {
    // Every 題組 authored before 2026-11-22. The child has no links, no
    // sibling has any, so the answer credits the group's concepts exactly
    // as it always did -- this is the compatibility case, and the reason
    // the change needs no backfill.
    expect(sorted(conceptIdsForReply([], [1, 2, 3], new Set()))).toEqual([1, 2, 3]);
  });

  it("leaves out a sibling's concept", () => {
    // Parent carries {1,2,3}: 1 is group-level, 2 is this child's, 3 is a
    // sibling's. Crediting 3 here is the bug this function exists for.
    expect(sorted(conceptIdsForReply([2], [1, 2, 3], new Set([2, 3])))).toEqual([1, 2]);
  });

  it('still credits the group-level concepts', () => {
    // The shortcut -- "the child's own and nothing else" -- would return
    // [2] and strand 1 forever.
    const credited = conceptIdsForReply([2], [1, 2, 3], new Set([2, 3]));
    expect(credited.has(1)).toBe(true);
  });

  it("keeps its own concept even when the parent somehow does not carry it", () => {
    // The merge means this should not happen. If a hand-written row makes
    // it happen, the answer still credits what the sub-question is tagged
    // with -- the parent's set only ever adds here, never gates.
    expect(sorted(conceptIdsForReply([9], [1], new Set([9])))).toEqual([1, 9]);
  });

  it('falls back to the group-level concepts for an untagged child of a tagged group', () => {
    // Half-tagged group: this child names nothing, a sibling names 3. It
    // credits the group-level 1 and not the sibling's 3 -- which is also
    // exactly what the card shows for it (no chip of its own, 1 in the
    // header).
    expect(sorted(conceptIdsForReply([], [1, 3], new Set([3])))).toEqual([1]);
  });

  it('credits nothing when every one of the parent concepts belongs to a sibling', () => {
    // Possible only for an untagged child of a group whose siblings have
    // claimed the lot. The reply still records, scores and awards points;
    // it just moves no concept's mastery, which is the honest outcome when
    // nothing says what this sub-question tests.
    expect(sorted(conceptIdsForReply([], [2, 3], new Set([2, 3])))).toEqual([]);
  });

  it('does not mutate the set it is given', () => {
    const claimed = new Set([2, 3]);
    conceptIdsForReply([2], [1, 2, 3], claimed);
    expect(sorted(claimed)).toEqual([2, 3]);
  });
});
