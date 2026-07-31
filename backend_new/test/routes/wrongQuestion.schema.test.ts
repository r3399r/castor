import { describe, expect, it } from 'vitest';
import { wrongQuestionListQuerySchema, wrongQuestionNoteBodySchema } from 'src/routes/wrongQuestion';

describe('wrongQuestionListQuerySchema', () => {
  it('defaults limit and offset when omitted', () => {
    const result = wrongQuestionListQuerySchema.safeParse({});
    expect(result.success && result.data).toMatchObject({ limit: 20, offset: 0 });
  });

  it('coerces limit/offset from query strings', () => {
    const result = wrongQuestionListQuerySchema.safeParse({ limit: '5', offset: '10' });
    expect(result.success && result.data).toMatchObject({ limit: 5, offset: 10 });
  });

  it('rejects a limit above MAX_LIMIT', () => {
    expect(wrongQuestionListQuerySchema.safeParse({ limit: '1001' }).success).toBe(false);
  });

  it('rejects a negative offset', () => {
    expect(wrongQuestionListQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);
  });

  it('coerces categoryId/subjectId and accepts examIds/tagIds as comma-joined id strings', () => {
    const result = wrongQuestionListQuerySchema.safeParse({
      categoryId: '7',
      subjectId: '3',
      examIds: '1,2',
      tagIds: '4,5',
    });
    expect(result.success && result.data).toMatchObject({
      categoryId: 7,
      subjectId: 3,
      examIds: '1,2',
      tagIds: '4,5',
    });
  });

  it('rejects a non-positive categoryId or subjectId', () => {
    expect(wrongQuestionListQuerySchema.safeParse({ categoryId: '0' }).success).toBe(false);
    expect(wrongQuestionListQuerySchema.safeParse({ subjectId: '0' }).success).toBe(false);
  });
});

describe('wrongQuestionNoteBodySchema', () => {
  it('accepts a note string', () => {
    const result = wrongQuestionNoteBodySchema.safeParse({ note: 'remember this' });
    expect(result.success && result.data.note).toBe('remember this');
  });

  it('accepts null to explicitly clear the note', () => {
    const result = wrongQuestionNoteBodySchema.safeParse({ note: null });
    expect(result.success && result.data.note).toBeNull();
  });

  it('rejects a missing note field', () => {
    expect(wrongQuestionNoteBodySchema.safeParse({}).success).toBe(false);
  });

  it('rejects a note longer than 2000 characters', () => {
    expect(wrongQuestionNoteBodySchema.safeParse({ note: 'a'.repeat(2001) }).success).toBe(false);
  });
});
