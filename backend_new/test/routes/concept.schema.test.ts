import { describe, expect, it } from 'vitest';
import { conceptBodySchema } from 'src/routes/concept';

describe('conceptBodySchema', () => {
  it('accepts a valid name and conceptGroupId', () => {
    const result = conceptBodySchema.safeParse({
      name: 'derivatives',
      conceptGroupId: 1,
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'derivatives', conceptGroupId: 1 });
  });

  it('ignores a numberOfQuestions field in the body -- not admin-editable', () => {
    const result = conceptBodySchema.safeParse({
      name: 'derivatives',
      conceptGroupId: 1,
      numberOfQuestions: 999,
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'derivatives', conceptGroupId: 1 });
  });

  it('rejects a missing name', () => {
    expect(
      conceptBodySchema.safeParse({ conceptGroupId: 1 }).success
    ).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(
      conceptBodySchema.safeParse({ name: '', conceptGroupId: 1 }).success
    ).toBe(false);
  });

  it('rejects a non-string name', () => {
    expect(
      conceptBodySchema.safeParse({ name: 42, conceptGroupId: 1 }).success
    ).toBe(false);
  });

  it('rejects a missing conceptGroupId', () => {
    expect(
      conceptBodySchema.safeParse({ name: 'derivatives' }).success
    ).toBe(false);
  });

  it('rejects a negative or zero conceptGroupId', () => {
    expect(
      conceptBodySchema.safeParse({ name: 'derivatives', conceptGroupId: -1 })
        .success
    ).toBe(false);
    expect(
      conceptBodySchema.safeParse({ name: 'derivatives', conceptGroupId: 0 })
        .success
    ).toBe(false);
  });

  it('rejects a non-integer conceptGroupId', () => {
    expect(
      conceptBodySchema.safeParse({ name: 'derivatives', conceptGroupId: 1.5 })
        .success
    ).toBe(false);
  });
});
