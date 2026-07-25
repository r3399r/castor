export class HttpError extends Error {
  public status: number;
  public code: string;

  constructor(status?: number, message?: string) {
    super(message ?? 'Unknown Error');
    this.status = status ?? 500;
    this.name = 'UnknownError';
    this.code = 'UNKNOWN_ERROR';
  }
}
