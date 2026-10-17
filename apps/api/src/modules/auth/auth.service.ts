import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Prisma, type AuthEventType, type PrismaClient, type User } from '@prisma/client';
import type {
  AuthActivityItem,
  NewRecoveryKey,
  PasswordResetOptions,
  PublicUser,
  RecoveryKeyStatus,
  SignupMode,
} from '@moneylens/types';
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  ResetWithLinkInput,
  ResetWithRecoveryKeyInput,
} from '@moneylens/validation';
import { SERVER_RESET_AGENT } from '@moneylens/shared';
import { AppError, unauthenticated } from '../../lib/errors';
import type { Mailer } from '../../lib/mailer';
import { getDummyHash, hashPassword, verifyPassword } from './password';
import type { TokenService } from './tokens';

export interface IssuedSession {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  /** A new recovery key to show the owner once (sign-up, reset with a key). */
  recoveryKey?: string;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  };
}

export interface LoginThrottle {
  /** Failed sign-ins for one account within the window before it is paused. */
  attempts: number;
  windowMinutes: number;
}

export interface SignupPolicy {
  mode: SignupMode;
  /** Accepted codes when `mode` is `invite`. */
  inviteCodes: readonly string[];
}

/** Compares in constant time, so response timing does not hint at a code. */
function codeMatches(given: string, codes: readonly string[]): boolean {
  const digest = (v: string) => createHash('sha256').update(v).digest();
  const wanted = digest(given);
  let found = false;
  for (const code of codes) found = timingSafeEqual(wanted, digest(code)) || found;
  return found;
}

export interface PasswordResetPolicy {
  /** Sends reset links; without one, email reset is off. */
  mailer?: Mailer;
  /** The web app's address, for the link in the email. */
  appUrl: string;
  /** Called when a reset email fails to send (the request itself still succeeds). */
  onMailError?: (err: unknown) => void;
}

/** How long an emailed reset link works. */
export const RESET_LINK_MINUTES = 30;
/** Reset emails per account per hour, so the form cannot flood someone's inbox. */
const RESET_EMAILS_PER_HOUR = 3;

// Crockford base32: no I, L, O or U, so a written-down key is not misread.
const KEY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A new recovery key: 24 characters (120 random bits), shown in groups of
 * four. Returns the key as shown and the normalised form that is hashed.
 */
export function generateRecoveryKey(): { display: string; normalised: string } {
  // 256 is a multiple of 32, so masking each byte keeps every character equally likely.
  const normalised = Array.from(randomBytes(24), (b) => KEY_ALPHABET[b & 31]).join('');
  return { display: normalised.replace(/(.{4})(?!$)/g, '$1-'), normalised };
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Sign-in activity is kept this long, then pruned. */
export const AUTH_EVENT_RETENTION_DAYS = 90;

/** Delete sign-in activity older than the retention period. */
export async function pruneAuthEvents(prisma: PrismaClient, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - AUTH_EVENT_RETENTION_DAYS * 86_400_000);
  const { count } = await prisma.authEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokens: TokenService,
    private readonly throttle: LoginThrottle = { attempts: 10, windowMinutes: 15 },
    /** Keys the email HMAC, so the stored value cannot be reversed with a word list. */
    private readonly emailKeySecret = 'moneylens-test-email-key',
    private readonly signup: SignupPolicy = { mode: 'open', inviteCodes: [] },
    private readonly reset: PasswordResetPolicy = { appUrl: 'http://localhost:5173' },
  ) {}

  get signupMode(): SignupMode {
    return this.signup.mode;
  }

  get resetOptions(): PasswordResetOptions {
    return { email: Boolean(this.reset.mailer) };
  }

  /** Throws unless this server lets the caller create an account. */
  private checkSignupAllowed(inviteCode: string | undefined): void {
    if (this.signup.mode === 'open') return;
    if (this.signup.mode === 'closed') {
      throw new AppError('FORBIDDEN', 'New accounts are not being created on this server.');
    }
    if (!inviteCode || !codeMatches(inviteCode, this.signup.inviteCodes)) {
      throw new AppError(
        'FORBIDDEN',
        'That invite code is not valid. Ask the person who invited you for the code.',
        { field: 'inviteCode' },
      );
    }
  }

  /** A stable, non-reversible key for an email address. */
  emailKey(email: string): string {
    return createHmac('sha256', this.emailKeySecret)
      .update(email.trim().toLowerCase())
      .digest('hex');
  }

  private async record(
    type: AuthEventType,
    data: { userId?: string | null; emailKey?: string | null; userAgent?: string },
  ): Promise<void> {
    await this.prisma.authEvent.create({
      data: {
        type,
        userId: data.userId ?? null,
        emailKey: data.emailKey ?? null,
        userAgent: data.userAgent?.slice(0, 255) ?? null,
      },
    });
  }

  /**
   * Failed sign-ins for this email since its last successful one, within the
   * window. Counting by email (not IP) slows down guessing one account's
   * password from many addresses; the IP rate limit covers the reverse.
   */
  private async recentFailures(
    emailKey: string,
    failed: AuthEventType = 'LOGIN_FAILED',
    succeeded: AuthEventType = 'LOGIN_SUCCEEDED',
  ): Promise<number> {
    const since = new Date(Date.now() - this.throttle.windowMinutes * 60_000);
    const lastSuccess = await this.prisma.authEvent.findFirst({
      where: { emailKey, type: succeeded, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return this.prisma.authEvent.count({
      where: {
        emailKey,
        type: failed,
        createdAt: {
          gte: lastSuccess && lastSuccess.createdAt > since ? lastSuccess.createdAt : since,
        },
      },
    });
  }

  async register(input: RegisterInput, userAgent?: string): Promise<IssuedSession> {
    this.checkSignupAllowed(input.inviteCode);
    const passwordHash = await hashPassword(input.password);
    // Every new account gets a recovery key, shown once, so a forgotten
    // password can be reset without email.
    const key = generateRecoveryKey();
    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash,
          recoveryKeyHash: await hashPassword(key.normalised),
          recoveryKeyCreatedAt: new Date(),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError('CONFLICT', 'An account with this email already exists');
      }
      throw err;
    }
    const session = await this.issueSession(user, randomUUID(), userAgent);
    await this.record('REGISTERED', {
      userId: user.id,
      emailKey: this.emailKey(user.email),
      userAgent,
    });
    return { ...session, recoveryKey: key.display };
  }

  async login(input: LoginInput, userAgent?: string): Promise<IssuedSession> {
    const emailKey = this.emailKey(input.email);
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });

    // The pause applies to registered and unknown emails alike, so it does not
    // reveal whether an account exists.
    if ((await this.recentFailures(emailKey)) >= this.throttle.attempts) {
      await this.record('LOGIN_BLOCKED', { userId: user?.id, emailKey, userAgent });
      throw new AppError(
        'RATE_LIMITED',
        `Too many sign-in attempts for this account. Try again in ${this.throttle.windowMinutes} minutes.`,
      );
    }

    // Always run a hash verification so response time does not reveal
    // whether the email is registered.
    const valid = await verifyPassword(
      user?.passwordHash ?? (await getDummyHash()),
      input.password,
    );
    if (!user || !valid) {
      await this.record('LOGIN_FAILED', { userId: user?.id, emailKey, userAgent });
      throw unauthenticated('Email or password is incorrect');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const session = await this.issueSession(user, randomUUID(), userAgent);
    await this.record('LOGIN_SUCCEEDED', { userId: user.id, emailKey, userAgent });
    return session;
  }

  /**
   * Rotate a refresh token. Presenting an already-rotated token is treated as
   * theft: the entire session family is revoked.
   */
  async refresh(refreshToken: string, userAgent?: string): Promise<IssuedSession> {
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!session) throw unauthenticated('Your session has ended. Please sign in again.');

    if (session.revokedAt) {
      await this.prisma.session.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.record('SESSION_REUSE_DETECTED', { userId: session.userId, userAgent });
      throw unauthenticated('Your session has ended. Please sign in again.');
    }
    if (session.expiresAt <= new Date()) {
      throw unauthenticated('Your session has expired. Please sign in again.');
    }

    // Conditional update guards against two concurrent refreshes both succeeding.
    const claimed = await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) throw unauthenticated('Your session has ended. Please sign in again.');

    const issued = await this.issueSession(session.user, session.familyId, userAgent);
    await this.prisma.session.update({
      where: { id: session.id },
      data: { replacedBy: this.tokens.hashRefreshToken(issued.refreshToken) },
    });
    return issued;
  }

  async logout(refreshToken: string | undefined, userAgent?: string): Promise<void> {
    if (!refreshToken) return;
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    const session = await this.prisma.session.findUnique({ where: { tokenHash } });
    if (!session) return;
    const revoked = await this.prisma.session.updateMany({
      where: { familyId: session.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count > 0) await this.record('LOGGED_OUT', { userId: session.userId, userAgent });
  }

  /**
   * Change the password after re-checking the current one. Every existing
   * session is revoked, so a device that knew the old password is signed out;
   * the caller gets a fresh session.
   */
  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    userAgent?: string,
  ): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw unauthenticated();
    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw new AppError('VALIDATION_ERROR', 'Current password is incorrect', {
        fields: { currentPassword: 'Current password is incorrect' },
      });
    }
    const passwordHash = await hashPassword(input.newPassword);
    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      ...this.signOutAndCancelResets(userId),
    ]);
    await this.record('PASSWORD_CHANGED', { userId, userAgent });
    return this.issueSession(updated, randomUUID(), userAgent);
  }

  /** Revokes every session and voids unused reset links (inside a transaction). */
  private signOutAndCancelResets(userId: string) {
    const now = new Date();
    return [
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: now },
      }),
    ];
  }

  async recoveryKeyStatus(userId: string): Promise<RecoveryKeyStatus> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw unauthenticated();
    return {
      createdAt: user.recoveryKeyHash ? (user.recoveryKeyCreatedAt?.toISOString() ?? null) : null,
    };
  }

  /**
   * Make a new recovery key after re-checking the password. The earlier key,
   * if any, stops working.
   */
  async createRecoveryKey(
    userId: string,
    password: string,
    userAgent?: string,
  ): Promise<NewRecoveryKey> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw unauthenticated();
    if (!(await verifyPassword(user.passwordHash, password))) {
      throw new AppError('VALIDATION_ERROR', 'Password is incorrect', {
        fields: { password: 'Password is incorrect' },
      });
    }
    const key = generateRecoveryKey();
    const createdAt = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        recoveryKeyHash: await hashPassword(key.normalised),
        recoveryKeyCreatedAt: createdAt,
      },
    });
    await this.record('RECOVERY_KEY_CREATED', { userId, userAgent });
    return { recoveryKey: key.display, createdAt: createdAt.toISOString() };
  }

  /**
   * Reset a forgotten password with the account's recovery key. The key is
   * used up: the owner gets a new one to save, every device is signed out,
   * and this one is signed in. Wrong keys are paused per account like
   * wrong passwords.
   */
  async resetWithRecoveryKey(
    input: ResetWithRecoveryKeyInput,
    userAgent?: string,
  ): Promise<IssuedSession> {
    const emailKey = this.emailKey(input.email);
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (
      (await this.recentFailures(emailKey, 'PASSWORD_RESET_FAILED', 'PASSWORD_RESET')) >=
      this.throttle.attempts
    ) {
      throw new AppError(
        'RATE_LIMITED',
        `Too many wrong recovery keys for this account. Try again in ${this.throttle.windowMinutes} minutes.`,
      );
    }
    // As with sign-in, always verify a hash so timing does not reveal accounts.
    const valid = await verifyPassword(
      user?.recoveryKeyHash ?? (await getDummyHash()),
      input.recoveryKey,
    );
    if (!user?.recoveryKeyHash || !valid) {
      await this.record('PASSWORD_RESET_FAILED', { userId: user?.id, emailKey, userAgent });
      throw new AppError('VALIDATION_ERROR', 'That email and recovery key do not match.', {
        fields: { recoveryKey: 'That email and recovery key do not match.' },
      });
    }

    const key = generateRecoveryKey();
    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword(input.newPassword),
          recoveryKeyHash: await hashPassword(key.normalised),
          recoveryKeyCreatedAt: new Date(),
        },
      }),
      ...this.signOutAndCancelResets(user.id),
    ]);
    await this.record('PASSWORD_RESET', { userId: user.id, emailKey, userAgent });
    const session = await this.issueSession(updated, randomUUID(), userAgent);
    return { ...session, recoveryKey: key.display };
  }

  /**
   * Email a reset link, if this server can send email and the account
   * exists. The answer is the same either way, so the form does not reveal
   * who has an account, and the email is sent in the background so timing
   * does not either.
   */
  async requestPasswordReset(email: string, userAgent?: string): Promise<void> {
    const { mailer } = this.reset;
    if (!mailer) {
      throw new AppError('FORBIDDEN', 'This MoneyLens cannot send email. Use your recovery key.');
    }
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;
    const recent = await this.prisma.authEvent.count({
      where: {
        userId: user.id,
        type: 'PASSWORD_RESET_REQUESTED',
        createdAt: { gte: new Date(Date.now() - 60 * 60_000) },
      },
    });
    if (recent >= RESET_EMAILS_PER_HOUR) return;

    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + RESET_LINK_MINUTES * 60_000),
      },
    });
    await this.record('PASSWORD_RESET_REQUESTED', { userId: user.id, userAgent });
    // The token goes after # so it never reaches a server log or another site.
    const link = `${this.reset.appUrl.replace(/\/+$/, '')}/reset-password#token=${token}`;
    void mailer
      .send({
        to: user.email,
        subject: 'Reset your MoneyLens password',
        text: [
          `Hi ${user.name},`,
          '',
          'Someone asked to reset the password for your MoneyLens account. To choose a new password, open this link:',
          '',
          link,
          '',
          `The link works once, for ${RESET_LINK_MINUTES} minutes.`,
          '',
          "If this wasn't you, ignore this email. Your password stays the same.",
        ].join('\n'),
      })
      .catch((err: unknown) => this.reset.onMailError?.(err));
  }

  /** Set a new password with an emailed link. Every device is signed out; this one is signed in. */
  async resetWithLink(input: ResetWithLinkInput, userAgent?: string): Promise<IssuedSession> {
    const now = new Date();
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(input.token) },
    });
    // Claim the link with a conditional update, so it cannot be used twice.
    const claimed =
      record && record.expiresAt > now
        ? await this.prisma.passwordResetToken.updateMany({
            where: { id: record.id, usedAt: null },
            data: { usedAt: now },
          })
        : { count: 0 };
    if (!record || claimed.count !== 1) {
      throw new AppError(
        'VALIDATION_ERROR',
        'This reset link has expired or was already used. Ask for a new one.',
        { fields: { token: 'This reset link has expired or was already used.' } },
      );
    }
    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await hashPassword(input.newPassword) },
      }),
      ...this.signOutAndCancelResets(record.userId),
    ]);
    await this.record('PASSWORD_RESET', {
      userId: updated.id,
      emailKey: this.emailKey(updated.email),
      userAgent,
    });
    return this.issueSession(updated, randomUUID(), userAgent);
  }

  /** Revoke every session of the account, on all devices. */
  async signOutEverywhere(userId: string, userAgent?: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.record('SIGNED_OUT_EVERYWHERE', { userId, userAgent });
  }

  /** The account's recent sign-in activity, newest first. */
  async activity(userId: string, limit = 20): Promise<AuthActivityItem[]> {
    const events = await this.prisma.authEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return events.map((e) => ({
      type: e.type,
      at: e.createdAt.toISOString(),
      userAgent: e.userAgent,
    }));
  }

  /**
   * Permanently delete the account. The password is re-checked so a stolen
   * access token alone cannot erase someone's data. Every user-owned row
   * cascades from User, including sessions.
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw unauthenticated();
    if (!(await verifyPassword(user.passwordHash, password))) {
      throw new AppError('VALIDATION_ERROR', 'Password is incorrect', {
        fields: { password: 'Password is incorrect' },
      });
    }
    // Failed sign-ins for unknown emails have no user link; remove those for
    // this address too, so nothing about the account remains.
    await this.prisma.$transaction([
      this.prisma.authEvent.deleteMany({ where: { emailKey: this.emailKey(user.email) } }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);
  }

  async getUser(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw unauthenticated();
    return toPublicUser(user);
  }

  private async issueSession(
    user: User,
    familyId: string,
    userAgent?: string,
  ): Promise<IssuedSession> {
    const refreshToken = this.tokens.generateRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + this.tokens.refreshTokenTtlMs);
    await this.prisma.session.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: this.tokens.hashRefreshToken(refreshToken),
        userAgent: userAgent?.slice(0, 255) ?? null,
        expiresAt: refreshExpiresAt,
      },
    });
    return {
      user: toPublicUser(user),
      accessToken: this.tokens.signAccessToken(user.id),
      refreshToken,
      refreshExpiresAt,
    };
  }
}

/**
 * Set a new password for an account from the computer running the server
 * (`npm run reset-password`), for someone with neither their password nor a
 * recovery key. Every device is signed out and unused reset links stop working.
 * Returns false when there is no account with that email.
 */
export async function resetPasswordFromServer(
  prisma: PrismaClient,
  email: string,
  newPassword: string,
): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return false;
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    }),
    prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.authEvent.create({
      data: { type: 'PASSWORD_RESET', userId: user.id, userAgent: SERVER_RESET_AGENT },
    }),
  ]);
  return true;
}
