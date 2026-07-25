import { describe, expect, it } from 'vitest';
import { BadRequestError, HttpError, NotFoundError } from 'src/model/error';

describe('HttpError subclasses', () => {
  it('defaults HttpError to an unknown 500', () => {
    const err = new HttpError();
    expect(err.status).toBe(500);
    expect(err.name).toBe('UnknownError');
    expect(err.code).toBe('UNKNOWN_ERROR');
  });

  it('defaults BadRequestError to 400 with a standard message and code', () => {
    const err = new BadRequestError();
    expect(err.status).toBe(400);
    expect(err.name).toBe('BadRequestError');
    expect(err.message).toBe('Bad Request');
    expect(err.code).toBe('BAD_REQUEST');
  });

  it('lets NotFoundError override message and code', () => {
    const err = new NotFoundError('category not found', 'CATEGORY_NOT_FOUND');
    expect(err.status).toBe(404);
    expect(err.message).toBe('category not found');
    expect(err.code).toBe('CATEGORY_NOT_FOUND');
  });
});
