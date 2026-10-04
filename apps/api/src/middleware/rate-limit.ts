import { rateLimit } from 'express-rate-limit';
import type { ApiFailure } from '@moneylens/types';

function limiter(windowMs: number, limit: number) {
  const body: ApiFailure = {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait and try again.' },
  };
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: body,
  });
}

export const apiRateLimit = (perMinute: number) => limiter(60_000, perMinute);
export const authRateLimit = (per15Minutes: number) => limiter(15 * 60_000, per15Minutes);
