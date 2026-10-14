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

  it('defaults MoneyLens AI to off and checks provider settings', () => {
    expect(loadEnv(base).AI_PROVIDER).toBe('none');
    expect(() => loadEnv({ ...base, AI_PROVIDER: 'anthropic' })).toThrow(/AI_API_KEY/);
    expect(() => loadEnv({ ...base, AI_PROVIDER: 'openai-compatible', AI_API_KEY: 'k' })).toThrow(
      /AI_BASE_URL/,
    );
    expect(loadEnv({ ...base, AI_PROVIDER: 'anthropic', AI_API_KEY: 'k' }).AI_PROVIDER).toBe(
      'anthropic',
    );
  });

  it('defaults to open sign-up and checks invite codes', () => {
    expect(loadEnv(base).SIGNUP_MODE).toBe('open');
    expect(() => loadEnv({ ...base, SIGNUP_MODE: 'invite' })).toThrow(/SIGNUP_INVITE_CODES/);
    expect(() =>
      loadEnv({ ...base, SIGNUP_MODE: 'invite', SIGNUP_INVITE_CODES: 'good-code-1,short' }),
    ).toThrow(/8 to 64/);
    expect(
      loadEnv({ ...base, SIGNUP_MODE: 'invite', SIGNUP_INVITE_CODES: ' asha-2026 , ravi-2026 ' })
        .SIGNUP_INVITE_CODES,
    ).toEqual(['asha-2026', 'ravi-2026']);
  });

  it('lowercases the AI allowlist and leaves it empty by default', () => {
    expect(loadEnv(base).AI_ALLOWED_EMAILS).toEqual([]);
    expect(loadEnv({ ...base, AI_ALLOWED_EMAILS: 'Me@Example.com, ' }).AI_ALLOWED_EMAILS).toEqual([
      'me@example.com',
    ]);
  });

  it('treats empty variables as unset', () => {
    const env = loadEnv({ ...base, AI_PROVIDER: '', AI_BASE_URL: '', SIGNUP_INVITE_CODES: '' });
    expect(env.AI_PROVIDER).toBe('none');
    expect(env.AI_BASE_URL).toBeUndefined();
    expect(env.SIGNUP_INVITE_CODES).toEqual([]);
  });

  it("trusts Render's own address when CORS_ORIGINS is not set", () => {
    const url = 'https://moneylens-x1.onrender.com';
    expect(loadEnv({ ...base, RENDER_EXTERNAL_URL: url }).CORS_ORIGINS).toEqual([url]);
    expect(
      loadEnv({ ...base, RENDER_EXTERNAL_URL: url, CORS_ORIGINS: 'https://a.test' }).CORS_ORIGINS,
    ).toEqual(['https://a.test']);
  });
});
