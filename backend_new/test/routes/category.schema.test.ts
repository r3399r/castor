import { describe, expect, it } from 'vitest';
import { CATEGORY_KINDS } from 'src/lib/categoryKind';
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

  it('accepts every kind the catalogue defines', () => {
    for (const kind of CATEGORY_KINDS)
      expect(postCategorySchema.safeParse({ name: 'x', kind }).success).toBe(true);
  });

  // Not a plausible family name: 'postgraduate' was used here until it
  // became clear a real fourth family could be called exactly that, which
  // would have turned this into a test asserting the opposite of its name.
  it('rejects a kind the catalogue does not define', () => {
    expect(postCategorySchema.safeParse({ name: 'x', kind: 'not-a-kind' }).success).toBe(
      false
    );
  });

  // Absent rather than defaulted, which is what lets PUT read it as "leave
  // the current kind alone" while POST reads it as DEFAULT_CATEGORY_KIND.
  it('leaves kind undefined when the body omits it', () => {
    const parsed = postCategorySchema.safeParse({ name: 'x' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.kind).toBeUndefined();
  });
});
