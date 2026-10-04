import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

const ISSUER = 'moneylens';
const AUDIENCE = 'moneylens-api';

export interface TokenService {
  readonly accessTokenTtlSeconds: number;
  readonly refreshTokenTtlMs: number;
  signAccessToken(userId: string): string;
  /** Returns the user id, or null for any invalid/expired token. */
  verifyAccessToken(token: string): string | null;
  generateRefreshToken(): string;
  hashRefreshToken(token: string): string;
}

export function createTokenService(opts: {
  secret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
}): TokenService {
  return {
    accessTokenTtlSeconds: opts.accessTokenTtlSeconds,
    refreshTokenTtlMs: opts.refreshTokenTtlDays * 24 * 60 * 60 * 1000,

    signAccessToken(userId) {
      return jwt.sign({ typ: 'access' }, opts.secret, {
        algorithm: 'HS256',
        subject: userId,
        issuer: ISSUER,
        audience: AUDIENCE,
        expiresIn: opts.accessTokenTtlSeconds,
      });
    },

    verifyAccessToken(token) {
      try {
        const payload = jwt.verify(token, opts.secret, {
          algorithms: ['HS256'],
          issuer: ISSUER,
          audience: AUDIENCE,
        });
        if (typeof payload === 'string' || payload.typ !== 'access' || !payload.sub) return null;
        return payload.sub;
      } catch {
        return null;
      }
    },

    generateRefreshToken() {
      return randomBytes(32).toString('base64url');
    },

    hashRefreshToken(token) {
      return createHash('sha256').update(token).digest('hex');
    },
  };
}
