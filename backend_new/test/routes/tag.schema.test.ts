import { describe, expect, it } from 'vitest';
import { tagBodySchema } from 'src/routes/tag';

describe('tagBodySchema', () => {
  it('accepts a valid name and subjectId', () => {
    const result = tagBodySchema.safeParse({ name: 'algebra', subjectId: 1 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'algebra', subjectId: 1 });
  });

  it('rejects a missing name', () => {
    expect(tagBodySchema.safeParse({ subjectId: 1 }).success).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(
      tagBodySchema.safeParse({ name: '', subjectId: 1 }).success
    ).toBe(false);
  });

  it('rejects a non-string name', () => {
    expect(
      tagBodySchema.safeParse({ name: 42, subjectId: 1 }).success
    ).toBe(false);
  });

  it('rejects a missing subjectId', () => {
    expect(tagBodySchema.safeParse({ name: 'algebra' }).success).toBe(false);
  });

  it('rejects a negative or zero subjectId', () => {
    expect(
      tagBodySchema.safeParse({ name: 'algebra', subjectId: -1 }).success
    ).toBe(false);
    expect(
      tagBodySchema.safeParse({ name: 'algebra', subjectId: 0 }).success
    ).toBe(false);
  });

  it('rejects a non-integer subjectId', () => {
    expect(
      tagBodySchema.safeParse({ name: 'algebra', subjectId: 1.5 }).success
    ).toBe(false);
  });
});
