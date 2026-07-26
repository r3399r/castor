import { describe, expect, it } from 'vitest';
import {
  filterOptionBodySchema,
  filterOptionSubjectBodySchema,
} from 'src/routes/filterOption';

describe('filterOptionBodySchema', () => {
  it('accepts a valid name and dimensionId, defaulting parentId to null', () => {
    const result = filterOptionBodySchema.safeParse({
      name: '行政類',
      dimensionId: 1,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.parentId).toBeNull();
  });

  it('accepts an explicit parentId', () => {
    const result = filterOptionBodySchema.safeParse({
      name: '普通行政',
      dimensionId: 1,
      parentId: 5,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.parentId).toBe(5);
  });

  it('accepts an explicit null parentId', () => {
    const result = filterOptionBodySchema.safeParse({
      name: 'x',
      dimensionId: 1,
      parentId: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing name', () => {
    expect(
      filterOptionBodySchema.safeParse({ dimensionId: 1 }).success
    ).toBe(false);
  });

  it('rejects a missing dimensionId', () => {
    expect(filterOptionBodySchema.safeParse({ name: 'x' }).success).toBe(
      false
    );
  });

  it('rejects a non-positive parentId', () => {
    expect(
      filterOptionBodySchema.safeParse({
        name: 'x',
        dimensionId: 1,
        parentId: 0,
      }).success
    ).toBe(false);
  });
});

describe('filterOptionSubjectBodySchema', () => {
  it('accepts an array of subject ids', () => {
    expect(
      filterOptionSubjectBodySchema.safeParse({ subjectIds: [1, 2, 3] })
        .success
    ).toBe(true);
  });

  it('accepts an empty array', () => {
    expect(
      filterOptionSubjectBodySchema.safeParse({ subjectIds: [] }).success
    ).toBe(true);
  });

  it('rejects a non-array subjectIds', () => {
    expect(
      filterOptionSubjectBodySchema.safeParse({ subjectIds: 1 }).success
    ).toBe(false);
  });
});
