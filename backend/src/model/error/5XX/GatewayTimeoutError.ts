import { HttpError } from 'src/model/error/HttpError';

/**
 * Gateway timeout error class (500)
 */
export class GatewayTimeoutError extends HttpError {
  constructor(message?: string, code?: string) {
    super(504, message ?? 'Gateway Timeout');
    this.name = 'GatewayTimeoutError';
    this.code = code ?? 'GATEWAY_TIMEOUT';
  }
}
