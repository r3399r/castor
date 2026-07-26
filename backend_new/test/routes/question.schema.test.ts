import { describe, expect, it } from 'vitest';
import { questionBodySchema } from 'src/routes/question';

const validQuestion = {
  type: 'SINGLE' as const,
  difficulty: 5,
  conceptIds: [1],
};

const validBody = {
  subjectId: 1,
  examId: 1,
  questions: [validQuestion],
};

describe('questionBodySchema', () => {
  it('accepts a minimal valid batch with one SINGLE question', () => {
    expect(questionBodySchema.safeParse(validBody).success).toBe(true);
  });

  it('accepts a batch with multiple questions', () => {
    const result = questionBodySchema.safeParse({
      ...validBody,
      questions: [validQuestion, validQuestion, validQuestion],
    });
    expect(result.success).toBe(true);
  });

  it('accepts type GROUP with childQuestions', () => {
    const result = questionBodySchema.safeParse({
      ...validBody,
      questions: [
        {
          ...validQuestion,
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
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid type', () => {
    const result = questionBodySchema.safeParse({
      ...validBody,
      questions: [{ ...validQuestion, type: 'BOGUS' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects childQuestions with type GROUP (a child cannot itself be a group)', () => {
    const result = questionBodySchema.safeParse({
      ...validBody,
      questions: [
        {
          ...validQuestion,
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
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty conceptIds', () => {
    const result = questionBodySchema.safeParse({
      ...validBody,
      questions: [{ ...validQuestion, conceptIds: [] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing conceptIds', () => {
    const { conceptIds: _conceptIds, ...rest } = validQuestion;
    const result = questionBodySchema.safeParse({
      ...validBody,
      questions: [rest],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty questions array', () => {
    const result = questionBodySchema.safeParse({ ...validBody, questions: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a missing examId', () => {
    const { examId: _examId, ...rest } = validBody;
    expect(questionBodySchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a missing subjectId', () => {
    const { subjectId: _subjectId, ...rest } = validBody;
    expect(questionBodySchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a difficulty below 1 or above 10', () => {
    expect(
      questionBodySchema.safeParse({
        ...validBody,
        questions: [{ ...validQuestion, difficulty: 0 }],
      }).success
    ).toBe(false);
    expect(
      questionBodySchema.safeParse({
        ...validBody,
        questions: [{ ...validQuestion, difficulty: 11 }],
      }).success
    ).toBe(false);
  });

  it('accepts optional tagIds, content, options, answer, solution per question', () => {
    const result = questionBodySchema.safeParse({
      ...validBody,
      questions: [
        {
          ...validQuestion,
          tagIds: [1, 2],
          content: 'question body',
          options: 'A|B|C|D',
          answer: 'A',
          solution: 'because...',
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
