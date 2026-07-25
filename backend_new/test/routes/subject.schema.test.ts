import { describe, expect, it } from 'vitest';
import {
  subjectBodySchema,
  subjectCategoryBodySchema,
} from 'src/routes/subject';

describe('subjectBodySchema', () => {
  it('accepts a valid name and sortOrder', () => {
    const result = subjectBodySchema.safeParse({ name: 'math', sortOrder: 3 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'math', sortOrder: 3 });
  });

  it('defaults sortOrder to 0 when omitted', () => {
    const result = subjectBodySchema.safeParse({ name: 'math' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'math', sortOrder: 0 });
  });

  it('rejects a missing name', () => {
    expect(subjectBodySchema.safeParse({}).success).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(subjectBodySchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects a non-string name', () => {
    expect(subjectBodySchema.safeParse({ name: 42 }).success).toBe(false);
  });

  it('rejects a negative sortOrder', () => {
    expect(
      subjectBodySchema.safeParse({ name: 'math', sortOrder: -1 }).success
    ).toBe(false);
  });

  it('rejects a sortOrder above 255', () => {
    expect(
      subjectBodySchema.safeParse({ name: 'math', sortOrder: 256 }).success
    ).toBe(false);
  });

  it('rejects a non-integer sortOrder', () => {
    expect(
      subjectBodySchema.safeParse({ name: 'math', sortOrder: 1.5 }).success
    ).toBe(false);
  });
});

describe('subjectCategoryBodySchema', () => {
  it('accepts an array of category ids', () => {
    const result = subjectCategoryBodySchema.safeParse({
      categoryIds: [1, 2, 3],
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ categoryIds: [1, 2, 3] });
  });

  it('accepts an empty array to clear all associations', () => {
    const result = subjectCategoryBodySchema.safeParse({ categoryIds: [] });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ categoryIds: [] });
  });

  it('rejects a missing categoryIds', () => {
    expect(subjectCategoryBodySchema.safeParse({}).success).toBe(false);
  });

  it('rejects a non-array categoryIds', () => {
    expect(
      subjectCategoryBodySchema.safeParse({ categoryIds: 1 }).success
    ).toBe(false);
  });

  it('rejects a negative or zero id in the array', () => {
    expect(
      subjectCategoryBodySchema.safeParse({ categoryIds: [1, -1] }).success
    ).toBe(false);
    expect(
      subjectCategoryBodySchema.safeParse({ categoryIds: [0] }).success
    ).toBe(false);
  });

  it('rejects a non-integer id in the array', () => {
    expect(
      subjectCategoryBodySchema.safeParse({ categoryIds: [1.5] }).success
    ).toBe(false);
  });
});
