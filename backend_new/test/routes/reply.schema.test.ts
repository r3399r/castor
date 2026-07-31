import { describe, expect, it } from 'vitest';
import { replyBodySchema, replyListQuerySchema } from 'src/routes/reply';

describe('replyBodySchema', () => {
  it('accepts a single reply item', () => {
    expect(replyBodySchema.safeParse([{ questionId: 1, repliedAnswer: 'A' }]).success).toBe(true);
  });

  it('accepts a batch of multiple reply items', () => {
    const result = replyBodySchema.safeParse([
      { questionId: 1, repliedAnswer: 'A' },
      { questionId: 2, repliedAnswer: 'OXO' },
    ]);
    expect(result.success).toBe(true);
  });

  it('accepts an empty repliedAnswer (an unanswered blank)', () => {
    expect(replyBodySchema.safeParse([{ questionId: 1, repliedAnswer: '' }]).success).toBe(true);
  });

  it('rejects an empty array', () => {
    expect(replyBodySchema.safeParse([]).success).toBe(false);
  });

  it('rejects a non-array body', () => {
    expect(replyBodySchema.safeParse({ questionId: 1, repliedAnswer: 'A' }).success).toBe(false);
  });

  it('rejects a missing questionId', () => {
    expect(replyBodySchema.safeParse([{ repliedAnswer: 'A' }]).success).toBe(false);
  });

  it('rejects a non-positive questionId', () => {
    expect(replyBodySchema.safeParse([{ questionId: 0, repliedAnswer: 'A' }]).success).toBe(false);
  });
});

describe('replyListQuerySchema', () => {
  it('defaults limit and offset when omitted', () => {
    const result = replyListQuerySchema.safeParse({});
    expect(result.success && result.data).toMatchObject({ limit: 20, offset: 0 });
  });

  it('coerces limit/offset from query strings', () => {
    const result = replyListQuerySchema.safeParse({ limit: '5', offset: '10' });
    expect(result.success && result.data).toMatchObject({ limit: 5, offset: 10 });
  });

  it('rejects a limit above MAX_LIMIT', () => {
    expect(replyListQuerySchema.safeParse({ limit: '1001' }).success).toBe(false);
  });

  it('rejects a negative offset', () => {
    expect(replyListQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);
  });

  it('coerces categoryId from a query string', () => {
    const result = replyListQuerySchema.safeParse({ categoryId: '7' });
    expect(result.success && result.data.categoryId).toBe(7);
  });

  it('rejects a non-positive categoryId', () => {
    expect(replyListQuerySchema.safeParse({ categoryId: '0' }).success).toBe(false);
  });

  it('coerces subjectId from a query string', () => {
    const result = replyListQuerySchema.safeParse({ subjectId: '3' });
    expect(result.success && result.data.subjectId).toBe(3);
  });

  it('leaves subjectId undefined when omitted', () => {
    const result = replyListQuerySchema.safeParse({});
    expect(result.success && result.data.subjectId).toBeUndefined();
  });

  it('rejects a non-positive subjectId', () => {
    expect(replyListQuerySchema.safeParse({ subjectId: '0' }).success).toBe(false);
  });

  it('accepts examIds and tagIds as comma-joined id strings', () => {
    const result = replyListQuerySchema.safeParse({ examIds: '1,2', tagIds: '3,4' });
    expect(result.success && result.data).toMatchObject({ examIds: '1,2', tagIds: '3,4' });
  });
});
