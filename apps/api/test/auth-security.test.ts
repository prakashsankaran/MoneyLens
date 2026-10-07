import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { pruneAuthEvents } from '../src/modules/auth/auth.service';
import { createTestContext, registerUser } from './helpers';

// A low threshold keeps the test short; the default is 10 in 15 minutes.
const { app, prisma, env } = createTestContext({
  LOGIN_LOCKOUT_ATTEMPTS: '3',
  LOGIN_LOCKOUT_MINUTES: '15',
});

const emailKeySecret = createHmac('sha256', env.JWT_ACCESS_SECRET)
  .update('moneylens:email-key')
  .digest('hex');

afterAll(async () => {
  await prisma.$disconnect();
});

const login = (email: string, password: string) =>
  request(app).post('/api/auth/login').set('User-Agent', 'vitest-agent').send({ email, password });

describe('per-account sign-in throttling', () => {
  it('pauses an account after repeated wrong passwords, even with the right one', async () => {
    const user = await registerUser(app);
    for (let i = 0; i < 3; i += 1) await login(user.email, 'wrong password!!').expect(401);

    const blocked = await login(user.email, user.password).expect(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.body.error.message).toMatch(/Try again in 15 minutes/);
  });

  it('treats unknown emails the same way, so the pause does not reveal accounts', async () => {
    const email = `nobody-${Date.now()}@example.test`;
    for (let i = 0; i < 3; i += 1) await login(email, 'wrong password!!').expect(401);
    const blocked = await login(email, 'wrong password!!').expect(429);
    expect(blocked.body.error.message).toMatch(/Too many sign-in attempts/);
  });

  it('only counts failures since the last successful sign-in', async () => {
    const user = await registerUser(app);
    await login(user.email, 'wrong password!!').expect(401);
    await login(user.email, 'wrong password!!').expect(401);
    await login(user.email, user.password).expect(200);
    await login(user.email, 'wrong password!!').expect(401);
    await login(user.email, 'wrong password!!').expect(401);
    await login(user.email, user.password).expect(200);
  });

  it('never stores the email address of an unknown sign-in', async () => {
    const email = `ghost-${Date.now()}@example.test`;
    await login(email, 'wrong password!!').expect(401);
    const events = await prisma.authEvent.findMany({
      where: { userId: null, type: 'LOGIN_FAILED' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e.emailKey).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(e)).not.toContain('ghost-');
    }
  });
});

describe('GET /api/auth/activity', () => {
  it("lists the account's own sign-in activity, newest first", async () => {
    const user = await registerUser(app);
    await login(user.email, 'wrong password!!').expect(401);
    const signedIn = await login(user.email, user.password).expect(200);

    const res = await request(app)
      .get('/api/auth/activity')
      .set('Authorization', `Bearer ${signedIn.body.data.accessToken}`)
      .expect(200);
    const types = (res.body.data as { type: string }[]).map((e) => e.type);
    expect(types).toEqual(['LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'REGISTERED']);
    expect(res.body.data[0].userAgent).toBe('vitest-agent');
    expect(Date.parse(res.body.data[0].at)).not.toBeNaN();
  });

  it('records refresh-token reuse and sign-out', async () => {
    const user = await registerUser(app);
    const cookie = user.cookie.find((c) => c.startsWith('ml_rt='))!.split(';')[0]!;
    await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(200);
    await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(401);

    const res = await request(app)
      .get('/api/auth/activity')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(res.body.data[0].type).toBe('SESSION_REUSE_DETECTED');

    const other = await login(user.email, user.password).expect(200);
    const otherCookie = (other.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    await request(app).post('/api/auth/logout').set('Cookie', otherCookie).expect(200);
    const after = await request(app)
      .get('/api/auth/activity')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(after.body.data[0].type).toBe('LOGGED_OUT');
  });

  it('needs a signed-in user', async () => {
    await request(app).get('/api/auth/activity').expect(401);
  });

  it('is deleted with the account, including failures before it existed', async () => {
    const email = `later-${Date.now()}@example.test`;
    await login(email, 'wrong password!!').expect(401);
    const user = await registerUser(app, { email });
    await request(app)
      .delete('/api/auth/account')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ password: user.password })
      .expect(200);
    const key = createHmac('sha256', emailKeySecret).update(email).digest('hex');
    const left = await prisma.authEvent.count({
      where: { OR: [{ userId: user.userId }, { emailKey: key }] },
    });
    expect(left).toBe(0);
  });
});

describe('pruneAuthEvents', () => {
  it('deletes activity older than 90 days and keeps the rest', async () => {
    const user = await registerUser(app);
    const old = await prisma.authEvent.create({
      data: {
        userId: user.userId,
        type: 'LOGIN_FAILED',
        createdAt: new Date(Date.now() - 91 * 86_400_000),
      },
    });
    await pruneAuthEvents(prisma);
    expect(await prisma.authEvent.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await prisma.authEvent.count({ where: { userId: user.userId } })).toBe(1);
  });
});

describe('POST /api/auth/password', () => {
  it('re-checks the current password, signs out other devices and returns a new session', async () => {
    const user = await registerUser(app);
    const otherDevice = user.cookie.find((c) => c.startsWith('ml_rt='))!.split(';')[0]!;

    const wrong = await request(app)
      .post('/api/auth/password')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ currentPassword: 'not my password', newPassword: 'a brand new passphrase' })
      .expect(400);
    expect(wrong.body.error.details.fields.currentPassword).toBeDefined();

    const res = await request(app)
      .post('/api/auth/password')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ currentPassword: user.password, newPassword: 'a brand new passphrase' })
      .expect(200);
    expect(typeof res.body.data.accessToken).toBe('string');
    const fresh = (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;

    await request(app).post('/api/auth/refresh').set('Cookie', otherDevice).expect(401);
    await request(app).post('/api/auth/refresh').set('Cookie', fresh).expect(200);
    await login(user.email, user.password).expect(401);
    await login(user.email, 'a brand new passphrase').expect(200);
  });

  it('rejects a new password that is short or unchanged', async () => {
    const user = await registerUser(app);
    for (const newPassword of ['short', user.password]) {
      const res = await request(app)
        .post('/api/auth/password')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ currentPassword: user.password, newPassword })
        .expect(400);
      expect(res.body.error.details.fields.newPassword).toBeDefined();
    }
  });
});

describe('POST /api/auth/sign-out-everywhere', () => {
  it('revokes every session of the account and nobody else’s', async () => {
    const user = await registerUser(app);
    const someoneElse = await registerUser(app);
    const second = await login(user.email, user.password).expect(200);
    const cookies = [
      user.cookie.find((c) => c.startsWith('ml_rt='))!.split(';')[0]!,
      (second.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!,
    ];

    await request(app)
      .post('/api/auth/sign-out-everywhere')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    for (const cookie of cookies) {
      await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
    }
    const theirs = someoneElse.cookie.find((c) => c.startsWith('ml_rt='))!.split(';')[0]!;
    await request(app).post('/api/auth/refresh').set('Cookie', theirs).expect(200);
  });
});
