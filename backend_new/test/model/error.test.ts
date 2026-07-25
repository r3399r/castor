import { describe, expect, it } from 'vitest';
import {
  BadRequestError,
  ForbiddenError,
  HttpError,
  NotFoundError,
  UnauthorizedError,
} from 'src/model/error';

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

  it('defaults UnauthorizedError to 401 with a standard message and code', () => {
    const err = new UnauthorizedError();
    expect(err.status).toBe(401);
    expect(err.name).toBe('UnauthorizedError');
    expect(err.message).toBe('Unauthorized');
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('defaults ForbiddenError to 403 with a standard message and code', () => {
    const err = new ForbiddenError();
    expect(err.status).toBe(403);
    expect(err.name).toBe('ForbiddenError');
    expect(err.message).toBe('Forbidden');
    expect(err.code).toBe('FORBIDDEN');
  });
});
