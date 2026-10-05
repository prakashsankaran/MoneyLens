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
import { AnalyticsService } from './modules/analytics/analytics.service';
import { analyticsRoutes } from './modules/analytics/analytics.routes';
import { CategoriesService } from './modules/categories/categories.service';
import { categoryRoutes } from './modules/categories/categories.routes';
import { DashboardService } from './modules/dashboard/dashboard.service';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes';
import { healthRoutes } from './modules/health/health.routes';
import { InsightsService } from './modules/insights/insights.service';
import { insightRoutes, recurringRoutes, reportRoutes } from './modules/insights/insights.routes';
import { ImportsService } from './modules/imports/imports.service';
import { importRoutes } from './modules/imports/imports.routes';
import { merchantRoutes } from './modules/merchants/merchants.routes';
import { MerchantsService } from './modules/merchants/merchants.service';
import { PlanService } from './modules/plan/plan.service';
import { budgetRoutes, moneyPlanRoutes } from './modules/plan/plan.routes';
import { RecurringService } from './modules/recurring/recurring.service';
import { TransactionsService } from './modules/transactions/transactions.service';
import { transactionRoutes } from './modules/transactions/transactions.routes';

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
  const recurring = new RecurringService(prisma, analyticsData);
  const insights = new InsightsService(analyticsData, recurring);
  // Keep recurring detection current. A failed refresh must not fail the
  // change the user made, so it is logged and the next change retries it.
  const onChange = (userId: string) =>
    recurring.refresh(userId).catch((err: unknown) => {
      logger.error({ err, userId }, 'Recurring payment refresh failed');
    });

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
      trustedOrigins: env.CORS_ORIGINS,
    }),
  );

  // Everything below requires an authenticated user.
  const requireAuth = authenticate(tokens);
  api.use(
    '/dashboard',
    requireAuth,
    dashboardRoutes(new DashboardService(analyticsData, insights)),
  );
  api.use('/categories', requireAuth, categoryRoutes(new CategoriesService(prisma)));
  api.use(
    '/transactions',
    requireAuth,
    transactionRoutes(new TransactionsService(prisma, onChange)),
  );
  api.use(
    '/imports',
    requireAuth,
    importRoutes(new ImportsService(prisma, onChange), { maxUploadMb: env.MAX_UPLOAD_MB }),
  );
  api.use('/merchants', requireAuth, merchantRoutes(new MerchantsService(prisma, onChange)));
  api.use(
    '/analytics',
    requireAuth,
    analyticsRoutes(new AnalyticsService(analyticsData), insights),
  );
  api.use('/insights', requireAuth, insightRoutes(insights));
  api.use('/recurring', requireAuth, recurringRoutes(recurring));
  api.use('/reports', requireAuth, reportRoutes(insights));
  const plan = new PlanService(prisma, analyticsData);
  api.use('/money-plan', requireAuth, moneyPlanRoutes(plan));
  api.use('/budgets', requireAuth, budgetRoutes(plan));

  app.use('/api', api);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
