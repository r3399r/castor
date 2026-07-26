import { describe, expect, it } from 'vitest';
import { questionBodySchema } from 'src/routes/question';

const validBody = {
  subjectId: 1,
  type: 'SINGLE' as const,
  difficulty: 5,
  examId: 1,
  conceptIds: [1],
};

describe('questionBodySchema', () => {
  it('accepts a minimal valid SINGLE question', () => {
    expect(questionBodySchema.safeParse(validBody).success).toBe(true);
  });

  it('accepts type GROUP with childQuestions', () => {
    const result = questionBodySchema.safeParse({
      ...validBody,
      type: 'GROUP',
      childQuestions: [
        {
          type: 'SINGLE',
          sortOrder: 0,
          content: 'child',
          options: 'A|B',
          answer: 'A',
          difficulty: 3,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid type', () => {
    expect(
      questionBodySchema.safeParse({ ...validBody, type: 'BOGUS' }).success
    ).toBe(false);
  });

  it('rejects childQuestions with type GROUP (a child cannot itself be a group)', () => {
    const result = questionBodySchema.safeParse({
      ...validBody,
      type: 'GROUP',
      childQuestions: [
        {
          type: 'GROUP',
          sortOrder: 0,
          content: 'child',
          options: 'A|B',
          answer: 'A',
          difficulty: 3,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty conceptIds', () => {
    expect(
      questionBodySchema.safeParse({ ...validBody, conceptIds: [] }).success
    ).toBe(false);
  });

  it('rejects a missing conceptIds', () => {
    const { conceptIds: _conceptIds, ...rest } = validBody;
    expect(questionBodySchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a missing examId', () => {
    const { examId: _examId, ...rest } = validBody;
    expect(questionBodySchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a difficulty below 1 or above 10', () => {
    expect(
      questionBodySchema.safeParse({ ...validBody, difficulty: 0 }).success
    ).toBe(false);
    expect(
      questionBodySchema.safeParse({ ...validBody, difficulty: 11 }).success
    ).toBe(false);
  });

  it('accepts optional tagIds, content, options, answer, solution', () => {
    const result = questionBodySchema.safeParse({
      ...validBody,
      tagIds: [1, 2],
      content: 'question body',
      options: 'A|B|C|D',
      answer: 'A',
      solution: 'because...',
    });
    expect(result.success).toBe(true);
  });
});
