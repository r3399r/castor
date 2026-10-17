import { HttpError } from 'src/model/error/HttpError';

export class TooManyRequestsError extends HttpError {
  constructor(message?: string, code?: string) {
    super(429, message ?? 'Too Many Requests');
    this.name = 'TooManyRequestsError';
    this.code = code ?? 'TOO_MANY_REQUESTS';
  }
}
