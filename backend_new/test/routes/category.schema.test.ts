import { describe, expect, it } from 'vitest';
import { postCategorySchema } from 'src/routes/category';

describe('postCategorySchema', () => {
  it('accepts a valid name', () => {
    expect(postCategorySchema.safeParse({ name: 'english' }).success).toBe(
      true
    );
  });

  it('rejects a missing name', () => {
    expect(postCategorySchema.safeParse({}).success).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(postCategorySchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects a non-string name', () => {
    expect(postCategorySchema.safeParse({ name: 42 }).success).toBe(false);
  });
});
