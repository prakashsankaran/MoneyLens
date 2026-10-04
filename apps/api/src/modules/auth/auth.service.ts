import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import type { PublicUser } from '@moneylens/types';
import type { LoginInput, RegisterInput } from '@moneylens/validation';
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

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokens: TokenService,
  ) {}

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
    return this.issueSession(user, randomUUID(), userAgent);
  }

  async login(input: LoginInput, userAgent?: string): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    // Always run a hash verification so response time does not reveal
    // whether the email is registered.
    const valid = await verifyPassword(
      user?.passwordHash ?? (await getDummyHash()),
      input.password,
    );
    if (!user || !valid) throw unauthenticated('Email or password is incorrect');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issueSession(user, randomUUID(), userAgent);
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

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    const session = await this.prisma.session.findUnique({ where: { tokenHash } });
    if (!session) return;
    await this.prisma.session.updateMany({
      where: { familyId: session.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
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
