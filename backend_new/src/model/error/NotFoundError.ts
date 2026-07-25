import { HttpError } from 'src/model/error/HttpError';

export class NotFoundError extends HttpError {
  constructor(message?: string, code?: string) {
    super(404, message ?? 'Not Found');
    this.name = 'NotFoundError';
    this.code = code ?? 'NOT_FOUND';
  }
}
