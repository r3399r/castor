import { describe, expect, it } from 'vitest';
import {
  questionAdaptiveQuerySchema,
  questionBodySchema,
  questionConceptBodySchema,
  questionEnabledBodySchema,
  questionImageAiSchema,
  questionImageBodySchema,
  questionImageResponseJsonSchema,
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

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGMAAQAABQAB';

const validImageBody = {
  subjectId: 1,
  images: [{ mimeType: 'image/png', data: PNG_BASE64 }],
};

describe('questionImageBodySchema', () => {
  it('accepts a minimal valid body with one image', () => {
    expect(questionImageBodySchema.safeParse(validImageBody).success).toBe(true);
  });

  it('accepts an optional note', () => {
    const result = questionImageBodySchema.safeParse({ ...validImageBody, note: '答案在最後一頁' });
    expect(result.success).toBe(true);
  });

  it('accepts application/pdf as a mime type', () => {
    const result = questionImageBodySchema.safeParse({
      ...validImageBody,
      images: [{ mimeType: 'application/pdf', data: PNG_BASE64 }],
    });
    expect(result.success).toBe(true);
  });

  it('strips a data URL prefix off the base64 payload', () => {
    const result = questionImageBodySchema.safeParse({
      ...validImageBody,
      images: [{ mimeType: 'image/png', data: `data:image/png;base64,${PNG_BASE64}` }],
    });
    expect(result.success && result.data.images[0].data).toBe(PNG_BASE64);
  });

  it('strips whitespace out of line-wrapped base64', () => {
    const wrapped = `${PNG_BASE64.slice(0, 20)}\n${PNG_BASE64.slice(20)}`;
    const result = questionImageBodySchema.safeParse({
      ...validImageBody,
      images: [{ mimeType: 'image/png', data: wrapped }],
    });
    expect(result.success && result.data.images[0].data).toBe(PNG_BASE64);
  });

  it('rejects an unsupported mime type', () => {
    const result = questionImageBodySchema.safeParse({
      ...validImageBody,
      images: [{ mimeType: 'image/gif', data: PNG_BASE64 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a payload that is not base64', () => {
    const result = questionImageBodySchema.safeParse({
      ...validImageBody,
      images: [{ mimeType: 'image/png', data: 'not base64!!' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty images array', () => {
    expect(questionImageBodySchema.safeParse({ ...validImageBody, images: [] }).success).toBe(false);
  });

  it('accepts up to 3 images, for a question screenshotted in several crops', () => {
    const result = questionImageBodySchema.safeParse({
      ...validImageBody,
      images: Array.from({ length: 3 }, () => ({ mimeType: 'image/png', data: PNG_BASE64 })),
    });
    expect(result.success).toBe(true);
  });

  it('rejects more than 3 images', () => {
    const result = questionImageBodySchema.safeParse({
      ...validImageBody,
      images: Array.from({ length: 4 }, () => ({ mimeType: 'image/png', data: PNG_BASE64 })),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing subjectId', () => {
    expect(questionImageBodySchema.safeParse({ images: validImageBody.images }).success).toBe(false);
  });
});

describe('questionImageAiSchema', () => {
  it('accepts the flat question shape QUESTION.md specifies', () => {
    const result = questionImageAiSchema.safeParse([
      {
        type: 'SINGLE',
        content: '<p>1 + 1 = ?</p>',
        options: 'A|B|C|D',
        answer: 'B',
        difficulty: 2,
        conceptIds: [1],
      },
    ]);
    expect(result.success).toBe(true);
  });

  it('accepts the GROUP shape, whose options/answer are explicit nulls', () => {
    const result = questionImageAiSchema.safeParse([
      {
        type: 'GROUP',
        content: '<p>閱讀下文</p>',
        options: null,
        answer: null,
        difficulty: 5,
        conceptIds: [],
        childQuestions: [
          {
            type: 'SINGLE',
            sortOrder: 0,
            content: '<p>子題</p>',
            options: 'A|B|C|D',
            answer: 'A',
            difficulty: 5,
          },
        ],
      },
    ]);
    expect(result.success).toBe(true);
  });

  it('accepts a question with conceptIds omitted entirely', () => {
    const result = questionImageAiSchema.safeParse([
      { type: 'FILL', content: '<p>填空</p>', options: '1|2|3', answer: '301', difficulty: 8 },
    ]);
    expect(result.success).toBe(true);
  });

  it('accepts an empty array (a paper with nothing recognizable on it)', () => {
    expect(questionImageAiSchema.safeParse([]).success).toBe(true);
  });

  it('rejects an object instead of an array', () => {
    expect(questionImageAiSchema.safeParse({ type: 'SINGLE' }).success).toBe(false);
  });

  it('rejects an unknown question type', () => {
    const result = questionImageAiSchema.safeParse([
      { type: 'ESSAY', content: '<p>申論</p>', difficulty: 5 },
    ]);
    expect(result.success).toBe(false);
  });

  it('rejects a difficulty outside 1-10', () => {
    const result = questionImageAiSchema.safeParse([
      { type: 'SINGLE', content: '<p>x</p>', options: 'A|B', answer: 'A', difficulty: 11 },
    ]);
    expect(result.success).toBe(false);
  });

  it('rejects empty content', () => {
    const result = questionImageAiSchema.safeParse([
      { type: 'SINGLE', content: '', options: 'A|B', answer: 'A', difficulty: 5 },
    ]);
    expect(result.success).toBe(false);
  });

  it('rejects a child question missing sortOrder', () => {
    const result = questionImageAiSchema.safeParse([
      {
        type: 'GROUP',
        content: '<p>題組</p>',
        difficulty: 5,
        childQuestions: [
          { type: 'SINGLE', content: '<p>子題</p>', options: 'A|B', answer: 'A', difficulty: 5 },
        ],
      },
    ]);
    expect(result.success).toBe(false);
  });
});

// The JSON Schema handed to the model and the zod schema that checks its
// reply are two hand-written copies of one contract. These assert they
// still agree, so editing one without the other fails here rather than in
// production as an AI_INVALID_SHAPE 502.
describe('questionImageResponseJsonSchema', () => {
  const itemSchema = questionImageResponseJsonSchema.items;
  const childSchema = itemSchema.properties.childQuestions.items;

  const minimalFromRequired = (type: string) => ({
    type,
    content: '<p>x</p>',
    difficulty: 5,
  });

  it('accepts under zod every question type the JSON schema allows', () => {
    for (const type of itemSchema.properties.type.enum) {
      const result = questionImageAiSchema.safeParse([minimalFromRequired(type)]);
      expect(result.success, `type ${type}`).toBe(true);
    }
  });

  it('agrees with zod on the child question types', () => {
    for (const type of childSchema.properties.type.enum) {
      const result = questionImageAiSchema.safeParse([
        {
          ...minimalFromRequired('GROUP'),
          childQuestions: [
            {
              type,
              sortOrder: 0,
              content: '<p>child</p>',
              options: 'A|B',
              answer: 'A',
              difficulty: 5,
            },
          ],
        },
      ]);
      expect(result.success, `child type ${type}`).toBe(true);
    }
  });

  it('marks exactly the fields zod requires as required', () => {
    // Everything else is optional in zod (.nullish() or omitted), so the
    // model is free to leave it out.
    expect(itemSchema.required).toEqual(['type', 'content', 'difficulty']);
    expect(childSchema.required).toEqual([
      'type',
      'sortOrder',
      'content',
      'options',
      'answer',
      'difficulty',
    ]);
  });

  it('agrees with zod on the difficulty bounds', () => {
    const { minimum, maximum } = itemSchema.properties.difficulty;
    expect(questionImageAiSchema.safeParse([{ ...minimalFromRequired('SINGLE'), difficulty: minimum }]).success).toBe(true);
    expect(questionImageAiSchema.safeParse([{ ...minimalFromRequired('SINGLE'), difficulty: maximum }]).success).toBe(true);
    expect(questionImageAiSchema.safeParse([{ ...minimalFromRequired('SINGLE'), difficulty: minimum - 1 }]).success).toBe(false);
    expect(questionImageAiSchema.safeParse([{ ...minimalFromRequired('SINGLE'), difficulty: maximum + 1 }]).success).toBe(false);
  });

  it('stays inside the subset of JSON Schema that responseJsonSchema supports', () => {
    // $ref/$defs/nullable unions are the usual output of a zod converter
    // and the usual cause of a rejected request -- assert the hand-written
    // schema never grows them.
    const serialized = JSON.stringify(questionImageResponseJsonSchema);
    for (const unsupported of ['$schema', '$ref', '$defs', 'nullable', 'allOf', 'not']) {
      expect(serialized, unsupported).not.toContain(unsupported);
    }
  });
});

describe('questionEnabledBodySchema', () => {
  it('accepts enabled true and false', () => {
    expect(questionEnabledBodySchema.safeParse({ enabled: true }).success).toBe(true);
    expect(questionEnabledBodySchema.safeParse({ enabled: false }).success).toBe(true);
  });

  it('rejects a missing enabled', () => {
    expect(questionEnabledBodySchema.safeParse({}).success).toBe(false);
  });

  it('rejects a non-boolean enabled, including the strings a form might send', () => {
    for (const enabled of ['true', 'false', 1, 0, null]) {
      expect(questionEnabledBodySchema.safeParse({ enabled }).success, String(enabled)).toBe(false);
    }
  });
});
