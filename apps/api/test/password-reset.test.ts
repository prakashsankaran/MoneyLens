import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { MailMessage } from '../src/lib/mailer';
import { generateRecoveryKey, resetPasswordFromServer } from '../src/modules/auth/auth.service';
import { createTestContext, registerUser } from './helpers';

const sent: MailMessage[] = [];
const mailer = {
  send: vi.fn(async (message: MailMessage) => {
    sent.push(message);
  }),
};

// A low threshold keeps the pause test short; the default is 10 in 15 minutes.
const { app, prisma } = createTestContext(
  { LOGIN_LOCKOUT_ATTEMPTS: '3', APP_URL: 'https://moneylens.example' },
  { mailer },
);
const noEmail = createTestContext();

afterAll(async () => {
  await prisma.$disconnect();
  await noEmail.prisma.$disconnect();
});

const NEW_PASSWORD = 'a brand new phrase';

const signIn = (email: string, password: string) =>
  request(app).post('/api/auth/login').send({ email, password });

const refreshCookie = (cookies: string[]) =>
  cookies.find((c) => c.startsWith('ml_rt='))!.split(';')[0]!;

/** Register and keep the recovery key the sign-up response shows once. */
async function registerWithKey() {
  const email = `reset-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Reset Tester', email, password: 'correct horse battery' })
    .expect(201);
  return {
    email,
    password: 'correct horse battery',
    accessToken: res.body.data.accessToken as string,
    cookie: refreshCookie(res.headers['set-cookie'] as unknown as string[]),
    recoveryKey: res.body.data.recoveryKey as string,
  };
}

/** The token in the newest reset email sent to this address. */
function linkTokenFor(email: string): string {
  const message = sent.filter((m) => m.to === email).at(-1);
  const match = message?.text.match(/reset-password#token=([\w-]+)/);
  if (!match) throw new Error(`No reset email for ${email}`);
  return match[1]!;
}

describe('recovery keys', () => {
  it('generates 24 unambiguous characters in groups of four', () => {
    const { display, normalised } = generateRecoveryKey();
    expect(display).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(normalised).toBe(display.replaceAll('-', ''));
    expect(generateRecoveryKey().normalised).not.toBe(normalised);
  });

  it('is shown once at sign-up and stored only as a hash', async () => {
    const user = await registerWithKey();
    expect(user.recoveryKey).toMatch(/^(\w{4}-){5}\w{4}$/);
    const row = await prisma.user.findUniqueOrThrow({ where: { email: user.email } });
    expect(row.recoveryKeyHash).toBeTruthy();
    expect(row.recoveryKeyHash).not.toContain(user.recoveryKey.replaceAll('-', ''));

    const status = await request(app)
      .get('/api/auth/recovery-key')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(status.body.data.createdAt).toEqual(expect.any(String));
  });

  it('resets the password, signs out every device and replaces the key', async () => {
    const user = await registerWithKey();
    // Typed loosely: lower case, spaces instead of dashes.
    const typed = user.recoveryKey.toLowerCase().replaceAll('-', ' ');
    const res = await request(app)
      .post('/api/auth/reset-password/recovery-key')
      .send({ email: user.email.toUpperCase(), recoveryKey: typed, newPassword: NEW_PASSWORD })
      .expect(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.recoveryKey).toMatch(/^(\w{4}-){5}\w{4}$/);
    expect(res.body.data.recoveryKey).not.toBe(user.recoveryKey);

    await signIn(user.email, user.password).expect(401);
    await signIn(user.email, NEW_PASSWORD).expect(200);
    // The device signed in before the reset is signed out.
    await request(app).post('/api/auth/refresh').set('Cookie', user.cookie).expect(401);

    // The old key is used up; the new one works.
    await request(app)
      .post('/api/auth/reset-password/recovery-key')
      .send({ email: user.email, recoveryKey: user.recoveryKey, newPassword: 'yet another phrase' })
      .expect(400);
    await request(app)
      .post('/api/auth/reset-password/recovery-key')
      .send({
        email: user.email,
        recoveryKey: res.body.data.recoveryKey,
        newPassword: 'yet another phrase',
      })
      .expect(200);
  });

  it('gives the same answer for a wrong key and an unknown email', async () => {
    const user = await registerWithKey();
    const wrongKey = generateRecoveryKey().display;
    const wrong = await request(app)
      .post('/api/auth/reset-password/recovery-key')
      .send({ email: user.email, recoveryKey: wrongKey, newPassword: NEW_PASSWORD })
      .expect(400);
    const unknown = await request(app)
      .post('/api/auth/reset-password/recovery-key')
      .send({
        email: `nobody-${Date.now()}@example.test`,
        recoveryKey: wrongKey,
        newPassword: NEW_PASSWORD,
      })
      .expect(400);
    expect(wrong.body.error).toEqual(unknown.body.error);
    expect(wrong.body.error.details.fields.recoveryKey).toMatch(/do not match/);
    await signIn(user.email, user.password).expect(200);
  });

  it('pauses an account after repeated wrong keys, even with the right one', async () => {
    const user = await registerWithKey();
    const attempt = (recoveryKey: string) =>
      request(app)
        .post('/api/auth/reset-password/recovery-key')
        .send({ email: user.email, recoveryKey, newPassword: NEW_PASSWORD });
    for (let i = 0; i < 3; i += 1) await attempt(generateRecoveryKey().display).expect(400);
    const blocked = await attempt(user.recoveryKey).expect(429);
    expect(blocked.body.error.message).toMatch(/Too many wrong recovery keys/);
  });

  it('rejects a key in the wrong shape before checking it', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password/recovery-key')
      .send({ email: 'someone@example.test', recoveryKey: 'ABCD-1234', newPassword: NEW_PASSWORD })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('makes a new key from Settings after re-checking the password', async () => {
    const user = await registerWithKey();
    const auth = { Authorization: `Bearer ${user.accessToken}` };
    const wrong = await request(app)
      .post('/api/auth/recovery-key')
      .set(auth)
      .send({ password: 'not my password' })
      .expect(400);
    expect(wrong.body.error.details.fields.password).toBe('Password is incorrect');

    const made = await request(app)
      .post('/api/auth/recovery-key')
      .set(auth)
      .send({ password: user.password })
      .expect(201);
    expect(made.body.data.recoveryKey).not.toBe(user.recoveryKey);

    // The key from sign-up stopped working.
    await request(app)
      .post('/api/auth/reset-password/recovery-key')
      .send({ email: user.email, recoveryKey: user.recoveryKey, newPassword: NEW_PASSWORD })
      .expect(400);
    const activity = await request(app).get('/api/auth/activity').set(auth).expect(200);
    expect(activity.body.data.map((e: { type: string }) => e.type)).toContain(
      'RECOVERY_KEY_CREATED',
    );
  });

  it('reports no key for an account made before recovery keys', async () => {
    const user = await registerUser(app);
    await prisma.user.update({
      where: { id: user.userId },
      data: { recoveryKeyHash: null, recoveryKeyCreatedAt: null },
    });
    const status = await request(app)
      .get('/api/auth/recovery-key')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(status.body.data.createdAt).toBeNull();
  });
});

describe('email reset links', () => {
  it('says whether this server can send email', async () => {
    const on = await request(app).get('/api/auth/reset-options').expect(200);
    expect(on.body.data).toEqual({ email: true });
    const off = await request(noEmail.app).get('/api/auth/reset-options').expect(200);
    expect(off.body.data).toEqual({ email: false });
    await request(noEmail.app)
      .post('/api/auth/forgot-password')
      .send({ email: 'someone@example.test' })
      .expect(403);
  });

  it('emails a single-use link that resets the password and signs out every device', async () => {
    const user = await registerWithKey();
    await request(app).post('/api/auth/forgot-password').send({ email: user.email }).expect(200);
    await vi.waitFor(() => linkTokenFor(user.email));
    const message = sent.filter((m) => m.to === user.email).at(-1)!;
    expect(message.subject).toBe('Reset your MoneyLens password');
    expect(message.text).toContain('https://moneylens.example/reset-password#token=');
    expect(message.text).toContain('Hi Reset Tester,');

    const token = linkTokenFor(user.email);
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: NEW_PASSWORD })
      .expect(200);
    expect(res.body.data.user.email).toBe(user.email);
    await signIn(user.email, NEW_PASSWORD).expect(200);
    await request(app).post('/api/auth/refresh').set('Cookie', user.cookie).expect(401);

    const again = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'yet another phrase' })
      .expect(400);
    expect(again.body.error.message).toMatch(/expired or was already used/);
    // The recovery key still works after an email reset.
    await request(app)
      .post('/api/auth/reset-password/recovery-key')
      .send({ email: user.email, recoveryKey: user.recoveryKey, newPassword: 'yet another phrase' })
      .expect(200);
  });

  it('stores only a hash of the link token', async () => {
    const user = await registerWithKey();
    await request(app).post('/api/auth/forgot-password').send({ email: user.email }).expect(200);
    await vi.waitFor(() => linkTokenFor(user.email));
    const token = linkTokenFor(user.email);
    const rows = await prisma.passwordResetToken.findMany({
      where: { user: { email: user.email } },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toContain(token);
  });

  it('refuses an expired link', async () => {
    const user = await registerWithKey();
    await request(app).post('/api/auth/forgot-password').send({ email: user.email }).expect(200);
    await vi.waitFor(() => linkTokenFor(user.email));
    const row = await prisma.passwordResetToken.findFirstOrThrow({
      where: { user: { email: user.email } },
    });
    await prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: linkTokenFor(user.email), newPassword: NEW_PASSWORD })
      .expect(400);
    await signIn(user.email, user.password).expect(200);
  });

  it('voids unused links when the password changes', async () => {
    const user = await registerWithKey();
    await request(app).post('/api/auth/forgot-password').send({ email: user.email }).expect(200);
    await vi.waitFor(() => linkTokenFor(user.email));
    await request(app)
      .post('/api/auth/password')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ currentPassword: user.password, newPassword: NEW_PASSWORD })
      .expect(200);
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: linkTokenFor(user.email), newPassword: 'yet another phrase' })
      .expect(400);
  });

  it('answers the same for unknown emails and sends nothing', async () => {
    const before = sent.length;
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: `nobody-${Date.now()}@example.test` })
      .expect(200);
    expect(res.body.data).toEqual({ requested: true });
    expect(sent.length).toBe(before);
  });

  it('sends at most three emails an hour to one account', async () => {
    const user = await registerWithKey();
    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/api/auth/forgot-password').send({ email: user.email }).expect(200);
    }
    await vi.waitFor(() => expect(sent.filter((m) => m.to === user.email)).toHaveLength(3));
  });
});

describe('resetPasswordFromServer', () => {
  it('sets the password and signs out every device', async () => {
    const user = await registerWithKey();
    expect(await resetPasswordFromServer(prisma, user.email, NEW_PASSWORD)).toBe(true);
    await signIn(user.email, user.password).expect(401);
    await signIn(user.email, NEW_PASSWORD).expect(200);
    await request(app).post('/api/auth/refresh').set('Cookie', user.cookie).expect(401);
  });

  it('reports an unknown email', async () => {
    expect(
      await resetPasswordFromServer(prisma, `nobody-${Date.now()}@example.test`, NEW_PASSWORD),
    ).toBe(false);
  });
});
