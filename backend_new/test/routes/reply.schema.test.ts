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

  it('accepts onlyWrong=true', () => {
    const result = replyListQuerySchema.safeParse({ onlyWrong: 'true' });
    expect(result.success && result.data.onlyWrong).toBe('true');
  });

  it('leaves onlyWrong undefined when omitted', () => {
    const result = replyListQuerySchema.safeParse({});
    expect(result.success && result.data.onlyWrong).toBeUndefined();
  });

  it('rejects onlyWrong=false (only the literal "true" is accepted; omit for "off")', () => {
    expect(replyListQuerySchema.safeParse({ onlyWrong: 'false' }).success).toBe(false);
  });
});
