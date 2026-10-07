import { createHmac, randomUUID } from 'node:crypto';
import { Prisma, type AuthEventType, type PrismaClient, type User } from '@prisma/client';
import type { AuthActivityItem, PublicUser } from '@moneylens/types';
import type { ChangePasswordInput, LoginInput, RegisterInput } from '@moneylens/validation';
import { AppError, unauthenticated } from '../../lib/errors';
import { getDummyHash, hashPassword, verifyPassword } from './password';
import type { TokenService } from './tokens';

export interface IssuedSession {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
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
  ) {}

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
  private async recentFailures(emailKey: string): Promise<number> {
    const since = new Date(Date.now() - this.throttle.windowMinutes * 60_000);
    const lastSuccess = await this.prisma.authEvent.findFirst({
      where: { emailKey, type: 'LOGIN_SUCCEEDED', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return this.prisma.authEvent.count({
      where: {
        emailKey,
        type: 'LOGIN_FAILED',
        createdAt: {
          gte: lastSuccess && lastSuccess.createdAt > since ? lastSuccess.createdAt : since,
        },
      },
    });
  }

  async register(input: RegisterInput, userAgent?: string): Promise<IssuedSession> {
    const passwordHash = await hashPassword(input.password);
    let user: User;
    try {
      user = await this.prisma.user.create({
        data: { email: input.email, name: input.name, passwordHash },
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
    return session;
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
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.record('PASSWORD_CHANGED', { userId, userAgent });
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
