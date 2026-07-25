import { describe, expect, it } from 'vitest';
import { toErrorResponse } from 'src/lib/errorResponse';
import { BadRequestError, NotFoundError } from 'src/model/error';

describe('toErrorResponse', () => {
  it('maps a known HttpError to its own status and body', () => {
    const { status, body } = toErrorResponse(
      new NotFoundError('category not found')
    );

    expect(status).toBe(404);
    expect(body).toEqual({
      status: 404,
      name: 'NotFoundError',
      message: 'category not found',
      code: 'NOT_FOUND',
    });
  });

  it('maps a different HttpError subclass to its own status', () => {
    const { status, body } = toErrorResponse(new BadRequestError());

    expect(status).toBe(400);
    expect(body).toMatchObject({
      name: 'BadRequestError',
      code: 'BAD_REQUEST',
    });
  });

  it('falls back to a generic 500 for a plain Error', () => {
    const { status, body } = toErrorResponse(new Error('boom'));

    expect(status).toBe(500);
    expect(body).toEqual({
      status: 500,
      name: 'InternalServerError',
      message: 'Internal Server Error',
    });
  });

  it('falls back to a generic 500 for a non-Error throw', () => {
    const { status, body } = toErrorResponse('a string was thrown');

    expect(status).toBe(500);
    expect(body.name).toBe('InternalServerError');
  });
});
