import { createApp } from './app';
import { loadEnv } from './config/env';
import { createLogger } from './lib/logger';
import { createPrismaClient } from './lib/prisma';
import { serveWeb } from './lib/serve-web';
import { createSmtpMailer } from './lib/smtp-mailer';
import { pruneAuthEvents } from './modules/auth/auth.service';
import { seedCategories } from './modules/categories/seed-categories';
import { monthlySummaryJob } from './modules/preferences/preferences.service';

const env = loadEnv();
const logger = createLogger(env);
const prisma = createPrismaClient();
const mailer = createSmtpMailer(env);
const app = createApp({
  env,
  prisma,
  logger,
  webApp: env.WEB_DIST_DIR ? serveWeb(env.WEB_DIST_DIR) : undefined,
  mailer,
});

// A fresh database (a new server) has no categories until this runs.
await seedCategories(prisma);

const server = app.listen(env.PORT, () => {
  logger.info(`MoneyLens API listening on http://localhost:${env.PORT}`);
});

// Sign-in activity is kept for a limited time; prune it daily.
const prune = () =>
  pruneAuthEvents(prisma).catch((err: unknown) =>
    logger.error({ err }, 'Pruning sign-in activity failed'),
  );
void prune();
setInterval(() => void prune(), 24 * 60 * 60 * 1000).unref();

// Monthly summary emails: checked every hour, so each one goes out soon after
// 9:00 IST on the 1st, or when the server next runs if it was off then.
if (mailer) {
  const sendDue = monthlySummaryJob({
    prisma,
    mailer,
    appUrl: env.APP_URL ?? env.CORS_ORIGINS[0] ?? 'http://localhost:5173',
    onMailError: (err, userId) => logger.error({ err, userId }, 'Sending a monthly summary failed'),
  });
  const run = () =>
    sendDue()
      .then((sent) => {
        if (sent > 0) logger.info(`Sent ${sent} monthly summary email(s)`);
      })
      .catch((err: unknown) => logger.error({ err }, 'Monthly summary run failed'));
  setTimeout(() => void run(), 60_000).unref();
  setInterval(() => void run(), 60 * 60 * 1000).unref();
}

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
