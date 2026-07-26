import { describe, expect, it } from 'vitest';
import { filterDimensionBodySchema } from 'src/routes/filterDimension';

describe('filterDimensionBodySchema', () => {
  it('accepts a valid name and categoryId, defaulting sortOrder to 0', () => {
    const result = filterDimensionBodySchema.safeParse({
      name: '類科分組',
      categoryId: 1,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.sortOrder).toBe(0);
  });

  it('accepts an explicit sortOrder', () => {
    const result = filterDimensionBodySchema.safeParse({
      name: '類科分組',
      categoryId: 1,
      sortOrder: 3,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.sortOrder).toBe(3);
  });

  it('rejects a missing name', () => {
    expect(
      filterDimensionBodySchema.safeParse({ categoryId: 1 }).success
    ).toBe(false);
  });

  it('rejects a missing categoryId', () => {
    expect(
      filterDimensionBodySchema.safeParse({ name: 'x' }).success
    ).toBe(false);
  });

  it('rejects a non-positive categoryId', () => {
    expect(
      filterDimensionBodySchema.safeParse({ name: 'x', categoryId: 0 })
        .success
    ).toBe(false);
  });

  it('rejects a sortOrder out of range', () => {
    expect(
      filterDimensionBodySchema.safeParse({
        name: 'x',
        categoryId: 1,
        sortOrder: 256,
      }).success
    ).toBe(false);
  });
});
