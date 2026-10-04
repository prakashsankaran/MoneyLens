import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import type { Env } from './config/env';
import { AnalyticsDataSource } from './lib/analytics-data';
import { authenticate } from './middleware/authenticate';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { apiRateLimit } from './middleware/rate-limit';
import { AuthService } from './modules/auth/auth.service';
import { authRoutes } from './modules/auth/auth.routes';
import { createTokenService } from './modules/auth/tokens';
import { categoryRoutes } from './modules/categories/categories.routes';
import { DashboardService } from './modules/dashboard/dashboard.service';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes';
import { healthRoutes } from './modules/health/health.routes';

export interface AppDeps {
  env: Env;
  prisma: PrismaClient;
  logger: Logger;
}

/** Build the Express app. Dependencies are injected so tests can supply their own. */
export function createApp({ env, prisma, logger }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger, autoLogging: env.NODE_ENV !== 'test' }));

  const tokens = createTokenService({
    secret: env.JWT_ACCESS_SECRET,
    accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
  });
  const analyticsData = new AnalyticsDataSource(prisma);

  const api = Router();
  api.use(apiRateLimit(env.API_RATE_LIMIT));
  api.use('/health', healthRoutes(prisma));
  api.use(
    '/auth',
    authRoutes({
      auth: new AuthService(prisma, tokens),
      tokens,
      secureCookies: env.NODE_ENV === 'production',
      rateLimitPer15Min: env.AUTH_RATE_LIMIT,
    }),
  );

  // Everything below requires an authenticated user.
  const requireAuth = authenticate(tokens);
  api.use('/dashboard', requireAuth, dashboardRoutes(new DashboardService(analyticsData)));
  api.use('/categories', requireAuth, categoryRoutes(analyticsData));

  app.use('/api', api);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
