import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://x',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
};

describe('loadEnv', () => {
  it('applies defaults and splits CORS origins', () => {
    const env = loadEnv({ ...base, CORS_ORIGINS: 'http://a.test, http://b.test' });
    expect(env.PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('refuses short secrets', () => {
    expect(() => loadEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('refuses the example secret in production', () => {
    expect(() =>
      loadEnv({
        ...base,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'change-me-to-a-long-random-string-at-least-32-chars',
      }),
    ).toThrow(/example value/);
  });
});
