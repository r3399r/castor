import { HttpError } from 'src/model/error/HttpError';

export class UnauthorizedError extends HttpError {
  constructor(message?: string, code?: string) {
    super(401, message ?? 'Unauthorized');
    this.name = 'UnauthorizedError';
    this.code = code ?? 'UNAUTHORIZED';
  }
}
