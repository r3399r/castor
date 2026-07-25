import { HttpError } from 'src/model/error/HttpError';

export class ForbiddenError extends HttpError {
  constructor(message?: string, code?: string) {
    super(403, message ?? 'Forbidden');
    this.name = 'ForbiddenError';
    this.code = code ?? 'FORBIDDEN';
  }
}
