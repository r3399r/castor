import { HttpError } from 'src/model/error/HttpError';

/**
 * Conflit error class (409)
 */
export class ConflictError extends HttpError {
  constructor(message?: string, code?: string) {
    super(409, message ?? 'Conflict');
    this.name = 'ConflictError';
    this.code = code ?? 'CONFLICT';
  }
}
