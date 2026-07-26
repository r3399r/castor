import { describe, expect, it } from 'vitest';
import { examBodySchema, examSubjectBodySchema } from 'src/routes/exam';

describe('examBodySchema', () => {
  it('accepts a valid name', () => {
    expect(examBodySchema.safeParse({ name: 'SAT' }).success).toBe(true);
  });

  it('rejects a missing name', () => {
    expect(examBodySchema.safeParse({}).success).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(examBodySchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects a non-string name', () => {
    expect(examBodySchema.safeParse({ name: 42 }).success).toBe(false);
  });
});

describe('examSubjectBodySchema', () => {
  it('accepts an array of subject ids', () => {
    const result = examSubjectBodySchema.safeParse({ subjectIds: [1, 2, 3] });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ subjectIds: [1, 2, 3] });
  });

  it('accepts an empty array to clear all associations', () => {
    const result = examSubjectBodySchema.safeParse({ subjectIds: [] });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ subjectIds: [] });
  });

  it('rejects a missing subjectIds', () => {
    expect(examSubjectBodySchema.safeParse({}).success).toBe(false);
  });

  it('rejects a non-array subjectIds', () => {
    expect(examSubjectBodySchema.safeParse({ subjectIds: 1 }).success).toBe(
      false
    );
  });

  it('rejects a negative or zero id in the array', () => {
    expect(
      examSubjectBodySchema.safeParse({ subjectIds: [1, -1] }).success
    ).toBe(false);
    expect(examSubjectBodySchema.safeParse({ subjectIds: [0] }).success).toBe(
      false
    );
  });

  it('rejects a non-integer id in the array', () => {
    expect(
      examSubjectBodySchema.safeParse({ subjectIds: [1.5] }).success
    ).toBe(false);
  });
});
