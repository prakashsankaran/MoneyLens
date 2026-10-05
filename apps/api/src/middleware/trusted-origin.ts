import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors';

/**
 * Refuse cookie-authenticated requests sent by pages on other sites. The
 * refresh cookie is already SameSite=Strict; this is a second check that does
 * not depend on browser cookie rules. Requests without an Origin header (not
 * sent by a browser page) are left to the cookie itself.
 */
export function trustedOrigin(allowed: readonly string[]): RequestHandler {
  const origins = new Set(allowed);
  return (req, _res, next) => {
    const origin = req.get('origin');
    if (origin && !origins.has(origin)) {
      next(new AppError('FORBIDDEN', 'This request came from a site MoneyLens does not trust.'));
      return;
    }
    next();
  };
}
