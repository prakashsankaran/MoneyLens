import type { ErrorCode } from '@moneylens/types';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/** An error that is safe to show to API clients. */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = STATUS_BY_CODE[code];
  }
}

export const unauthenticated = (message = 'Authentication required') =>
  new AppError('UNAUTHENTICATED', message);
export const notFound = (message = 'Resource not found') => new AppError('NOT_FOUND', message);
