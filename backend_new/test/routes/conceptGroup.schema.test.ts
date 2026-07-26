import { describe, expect, it } from 'vitest';
import { conceptGroupBodySchema } from 'src/routes/conceptGroup';

describe('conceptGroupBodySchema', () => {
  it('accepts a valid name and subjectId', () => {
    const result = conceptGroupBodySchema.safeParse({
      name: 'algebra basics',
      subjectId: 1,
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'algebra basics', subjectId: 1 });
  });

  it('rejects a missing name', () => {
    expect(
      conceptGroupBodySchema.safeParse({ subjectId: 1 }).success
    ).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(
      conceptGroupBodySchema.safeParse({ name: '', subjectId: 1 }).success
    ).toBe(false);
  });

  it('rejects a non-string name', () => {
    expect(
      conceptGroupBodySchema.safeParse({ name: 42, subjectId: 1 }).success
    ).toBe(false);
  });

  it('rejects a missing subjectId', () => {
    expect(
      conceptGroupBodySchema.safeParse({ name: 'algebra basics' }).success
    ).toBe(false);
  });

  it('rejects a negative or zero subjectId', () => {
    expect(
      conceptGroupBodySchema.safeParse({ name: 'algebra basics', subjectId: -1 })
        .success
    ).toBe(false);
    expect(
      conceptGroupBodySchema.safeParse({ name: 'algebra basics', subjectId: 0 })
        .success
    ).toBe(false);
  });

  it('rejects a non-integer subjectId', () => {
    expect(
      conceptGroupBodySchema.safeParse({ name: 'algebra basics', subjectId: 1.5 })
        .success
    ).toBe(false);
  });
});
