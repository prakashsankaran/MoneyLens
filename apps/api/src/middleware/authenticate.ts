import type { RequestHandler } from 'express';
import { unauthenticated } from '../lib/errors';
import type { TokenService } from '../modules/auth/tokens';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by `authenticate`; every user-scoped query must filter by it. */
    userId?: string;
  }
}

/** Requires a valid `Authorization: Bearer <access token>` header. */
export function authenticate(tokens: TokenService): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthenticated();
    const userId = tokens.verifyAccessToken(header.slice('Bearer '.length).trim());
    if (!userId) throw unauthenticated('Your session has expired. Please sign in again.');
    req.userId = userId;
    next();
  };
}

/** The authenticated user's id. Only call after `authenticate`. */
export function requireUserId(req: { userId?: string }): string {
  if (!req.userId) throw unauthenticated();
  return req.userId;
}
