import { HttpError } from 'src/model/error/HttpError';

export class BadGatewayError extends HttpError {
  constructor(message?: string, code?: string) {
    super(502, message ?? 'Bad Gateway');
    this.name = 'BadGatewayError';
    this.code = code ?? 'BAD_GATEWAY';
  }
}
