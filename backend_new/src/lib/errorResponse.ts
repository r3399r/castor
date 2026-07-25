import { ContentfulStatusCode } from 'hono/utils/http-status';
import { HttpError } from 'src/model/error';

export type ErrorResponseBody = {
  status: number;
  name: string;
  message: string;
  code?: string;
};

export const toErrorResponse = (
  err: unknown
): { status: ContentfulStatusCode; body: ErrorResponseBody } => {
  if (err instanceof HttpError)
    return {
      status: err.status as ContentfulStatusCode,
      body: {
        status: err.status,
        name: err.name,
        message: err.message,
        code: err.code,
      },
    };

  return {
    status: 500,
    body: {
      status: 500,
      name: 'InternalServerError',
      message: 'Internal Server Error',
    },
  };
};
