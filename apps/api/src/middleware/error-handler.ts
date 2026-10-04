import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import type { ApiFailure } from '@moneylens/types';
import { AppError } from '../lib/errors';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError('NOT_FOUND', `No route for ${req.method} ${req.path}`));
};

interface HttpLikeError {
  status?: number;
  type?: string;
}

/**
 * Converts every error to the standard envelope. Unknown errors are logged with
 * their stack but clients only ever see a generic message.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, _req, res, _next) => {
    let appError: AppError;

    if (err instanceof AppError) {
      appError = err;
    } else if ((err as HttpLikeError)?.type === 'entity.parse.failed') {
      appError = new AppError('VALIDATION_ERROR', 'Request body is not valid JSON');
    } else if ((err as HttpLikeError)?.type === 'entity.too.large') {
      appError = new AppError('PAYLOAD_TOO_LARGE', 'Request body is too large');
    } else {
      logger.error({ err }, 'Unhandled error');
      appError = new AppError('INTERNAL_ERROR', 'Something went wrong. Please try again.');
    }

    const body: ApiFailure = {
      success: false,
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details ? { details: appError.details } : {}),
      },
    };
    res.status(appError.status).json(body);
  };
}
