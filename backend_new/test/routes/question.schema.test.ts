import { describe, expect, it } from 'vitest';
import {
  questionAdaptiveQuerySchema,
  questionBodySchema,
  questionConceptBodySchema,
  questionTagBodySchema,
  questionUpdateBodySchema,
} from 'src/routes/question';

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

describe('questionUpdateBodySchema', () => {
  const validUpdate = { type: 'SINGLE' as const, difficulty: 5, examId: 1 };

  it('accepts a minimal valid update', () => {
    expect(questionUpdateBodySchema.safeParse(validUpdate).success).toBe(true);
  });

  it('does not accept subjectId (update never changes the owning subject)', () => {
    const result = questionUpdateBodySchema.safeParse({ ...validUpdate, subjectId: 1 });
    // subjectId isn't part of the schema, so zod strips it rather than
    // rejecting -- the important thing is the parsed value has no
    // subjectId field for the route to accidentally use.
    expect(result.success && 'subjectId' in result.data).toBe(false);
  });

  it('rejects a missing examId', () => {
    const { examId: _examId, ...rest } = validUpdate;
    expect(questionUpdateBodySchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a difficulty outside 1-10', () => {
    expect(
      questionUpdateBodySchema.safeParse({ ...validUpdate, difficulty: 0 }).success
    ).toBe(false);
  });
});

describe('questionTagBodySchema', () => {
  it('accepts an array of tag ids', () => {
    expect(questionTagBodySchema.safeParse({ tagIds: [1, 2] }).success).toBe(true);
  });

  it('accepts an empty array', () => {
    expect(questionTagBodySchema.safeParse({ tagIds: [] }).success).toBe(true);
  });

  it('rejects a non-array tagIds', () => {
    expect(questionTagBodySchema.safeParse({ tagIds: 1 }).success).toBe(false);
  });
});

describe('questionConceptBodySchema', () => {
  it('accepts a non-empty array of concept ids', () => {
    expect(questionConceptBodySchema.safeParse({ conceptIds: [1] }).success).toBe(true);
  });

  it('rejects an empty array', () => {
    expect(questionConceptBodySchema.safeParse({ conceptIds: [] }).success).toBe(false);
  });
});

describe('questionAdaptiveQuerySchema', () => {
  it('defaults count to 1 when omitted', () => {
    const result = questionAdaptiveQuerySchema.safeParse({ subjectId: '1' });
    expect(result.success && result.data.count).toBe(1);
  });

  it('coerces subjectId and count from query strings', () => {
    const result = questionAdaptiveQuerySchema.safeParse({ subjectId: '3', count: '5' });
    expect(result.success && result.data).toMatchObject({ subjectId: 3, count: 5 });
  });

  it('rejects a missing subjectId', () => {
    expect(questionAdaptiveQuerySchema.safeParse({}).success).toBe(false);
  });

  it('rejects a count above 50', () => {
    expect(questionAdaptiveQuerySchema.safeParse({ subjectId: '1', count: '51' }).success).toBe(false);
  });

  it('rejects a count of 0', () => {
    expect(questionAdaptiveQuerySchema.safeParse({ subjectId: '1', count: '0' }).success).toBe(false);
  });

  it('accepts optional examIds/conceptIds/tagIds as comma-separated strings', () => {
    const result = questionAdaptiveQuerySchema.safeParse({
      subjectId: '1',
      examIds: '1,2',
      conceptIds: '3,4',
      tagIds: '5,6',
    });
    expect(result.success).toBe(true);
  });
});
