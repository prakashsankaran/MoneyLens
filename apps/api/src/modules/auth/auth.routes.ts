import { Router, type CookieOptions, type Response } from 'express';
import type { AuthResult } from '@moneylens/types';
import { deleteAccountSchema, loginSchema, registerSchema } from '@moneylens/validation';
import { unauthenticated } from '../../lib/errors';
import { ok } from '../../lib/respond';
import { authenticate, requireUserId } from '../../middleware/authenticate';
import { authRateLimit } from '../../middleware/rate-limit';
import { parseInput } from '../../middleware/validate';
import type { AuthService, IssuedSession } from './auth.service';
import type { TokenService } from './tokens';

export const REFRESH_COOKIE = 'ml_rt';

export function authRoutes(deps: {
  auth: AuthService;
  tokens: TokenService;
  secureCookies: boolean;
  rateLimitPer15Min: number;
}): Router {
  const { auth, tokens } = deps;
  const router = Router();
  const credentialLimiter = authRateLimit(deps.rateLimitPer15Min);

  // The refresh token lives in an httpOnly cookie scoped to the auth routes, so
  // page scripts can never read it. The short-lived access token is returned in
  // the body and held in memory by the client.
  const cookieOptions = (expires?: Date): CookieOptions => ({
    httpOnly: true,
    secure: deps.secureCookies,
    sameSite: 'strict',
    path: '/api/auth',
    ...(expires ? { expires } : {}),
  });

  const sendSession = (res: Response, session: IssuedSession, status = 200) => {
    res.cookie(REFRESH_COOKIE, session.refreshToken, cookieOptions(session.refreshExpiresAt));
    const body: AuthResult = {
      user: session.user,
      accessToken: session.accessToken,
      expiresIn: tokens.accessTokenTtlSeconds,
    };
    ok(res, body, status);
  };

  router.post('/register', credentialLimiter, async (req, res) => {
    const input = parseInput(registerSchema, req.body);
    sendSession(res, await auth.register(input, req.get('user-agent')), 201);
  });

  router.post('/login', credentialLimiter, async (req, res) => {
    const input = parseInput(loginSchema, req.body);
    sendSession(res, await auth.login(input, req.get('user-agent')));
  });

  router.post('/refresh', credentialLimiter, async (req, res) => {
    const token = readRefreshCookie(req.cookies);
    try {
      if (!token) throw unauthenticated('Your session has ended. Please sign in again.');
      sendSession(res, await auth.refresh(token, req.get('user-agent')));
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, cookieOptions());
      throw err;
    }
  });

  router.post('/logout', async (req, res) => {
    await auth.logout(readRefreshCookie(req.cookies));
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    ok(res, { loggedOut: true });
  });

  router.get('/me', authenticate(tokens), async (req, res) => {
    ok(res, await auth.getUser(requireUserId(req)));
  });

  // Account deletion lives here so the refresh cookie (scoped to /api/auth)
  // is cleared in the same response. Rate-limited like other password checks.
  router.delete('/account', authenticate(tokens), credentialLimiter, async (req, res) => {
    const { password } = parseInput(deleteAccountSchema, req.body);
    await auth.deleteAccount(requireUserId(req), password);
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    ok(res, { deleted: true });
  });

  return router;
}

function readRefreshCookie(cookies: unknown): string | undefined {
  if (!cookies || typeof cookies !== 'object') return undefined;
  const value = (cookies as Record<string, unknown>)[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
