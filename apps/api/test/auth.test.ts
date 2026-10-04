import request from 'supertest';
import jwt from 'jsonwebtoken';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestContext, registerUser } from './helpers';

const { app, prisma, env } = createTestContext();

afterAll(async () => {
  await prisma.$disconnect();
});

function refreshCookie(setCookie: string[] | undefined): string {
  const cookie = setCookie?.find((c) => c.startsWith('ml_rt='));
  if (!cookie) throw new Error('No refresh cookie set');
  return cookie.split(';')[0] as string;
}

describe('POST /api/auth/register', () => {
  it('creates a user, hashes the password and sets a secure refresh cookie', async () => {
    const stamp = Date.now();
    const email = `priya.${stamp}@example.test`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Priya',
        email: ` Priya.${stamp}@Example.TEST `,
        password: 'a-long-passphrase',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toMatchObject({ name: 'Priya', email });
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(typeof res.body.data.accessToken).toBe('string');

    const cookie = (res.headers['set-cookie'] as unknown as string[])[0] ?? '';
    expect(cookie).toMatch(/^ml_rt=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);

    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored.passwordHash).not.toContain('a-long-passphrase');

    const session = await prisma.session.findFirstOrThrow({ where: { userId: stored.id } });
    expect(session.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(cookie).not.toContain(session.tokenHash);
  });

  it('rejects a duplicate email with 409', async () => {
    const { email } = await registerUser(app);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Again', email, password: 'another-passphrase' })
      .expect(409);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'CONFLICT', message: 'An account with this email already exists' },
    });
  });

  it('validates input and reports field errors', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: '', email: 'not-an-email', password: 'short' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.details.fields).sort()).toEqual([
      'email',
      'name',
      'password',
    ]);
  });
});

describe('POST /api/auth/login', () => {
  it('signs in with correct credentials', async () => {
    const { email, password } = await registerUser(app);
    const res = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.expiresIn).toBe(env.ACCESS_TOKEN_TTL_SECONDS);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const { email } = await registerUser(app);
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'wrong-password!' })
      .expect(401);
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.test', password: 'whatever-password' })
      .expect(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.headers['set-cookie']).toBeUndefined();
  });
});

describe('GET /api/auth/me', () => {
  it('requires a bearer token', async () => {
    const res = await request(app).get('/api/auth/me').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the current user', async () => {
    const { accessToken, email } = await registerUser(app);
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.data.email).toBe(email);
  });

  it.each([
    ['a tampered token', (t: string) => `${t.slice(0, -2)}xx`],
    [
      'a token signed with another secret',
      () =>
        jwt.sign({ typ: 'access' }, 'another-secret-another-secret-0123456789', {
          subject: 'someone',
          issuer: 'moneylens',
          audience: 'moneylens-api',
        }),
    ],
    [
      'an expired token',
      (_t: string, userId: string) =>
        jwt.sign({ typ: 'access' }, env.JWT_ACCESS_SECRET, {
          subject: userId,
          issuer: 'moneylens',
          audience: 'moneylens-api',
          expiresIn: -10,
        }),
    ],
    [
      'an unsigned (alg=none) token',
      (_t: string, userId: string) =>
        jwt.sign({ typ: 'access', sub: userId, iss: 'moneylens', aud: 'moneylens-api' }, '', {
          algorithm: 'none',
        }),
    ],
  ])('rejects %s', async (_label, makeToken) => {
    const { accessToken, userId } = await registerUser(app);
    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${makeToken(accessToken, userId)}`)
      .expect(401);
  });
});

describe('refresh token rotation', () => {
  it('rotates the refresh token and issues a new access token', async () => {
    const { cookie } = await registerUser(app);
    const first = refreshCookie(cookie);
    const res = await request(app).post('/api/auth/refresh').set('Cookie', first).expect(200);
    const second = refreshCookie(res.headers['set-cookie'] as unknown as string[]);
    expect(second).not.toBe(first);
    expect(typeof res.body.data.accessToken).toBe('string');
  });

  it('revokes the whole session family when a rotated token is reused', async () => {
    const { cookie } = await registerUser(app);
    const first = refreshCookie(cookie);
    const res = await request(app).post('/api/auth/refresh').set('Cookie', first).expect(200);
    const second = refreshCookie(res.headers['set-cookie'] as unknown as string[]);

    // An attacker replays the old token...
    await request(app).post('/api/auth/refresh').set('Cookie', first).expect(401);
    // ...which also invalidates the legitimate newer token.
    await request(app).post('/api/auth/refresh').set('Cookie', second).expect(401);
  });

  it('rejects a missing refresh cookie', async () => {
    await request(app).post('/api/auth/refresh').expect(401);
  });

  it('logout revokes the session', async () => {
    const { cookie } = await registerUser(app);
    const token = refreshCookie(cookie);
    await request(app).post('/api/auth/logout').set('Cookie', token).expect(200);
    await request(app).post('/api/auth/refresh').set('Cookie', token).expect(401);
  });
});

describe('rate limiting', () => {
  it('limits repeated credential attempts', async () => {
    const limited = createTestContext({ AUTH_RATE_LIMIT: '3' });
    const attempt = () =>
      request(limited.app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.test', password: 'whatever-password' });
    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    await limited.prisma.$disconnect();
  });
});
