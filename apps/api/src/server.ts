import { createApp } from './app';
import { loadEnv } from './config/env';
import { createLogger } from './lib/logger';
import { createPrismaClient } from './lib/prisma';

const env = loadEnv();
const logger = createLogger(env);
const prisma = createPrismaClient();
const app = createApp({ env, prisma, logger });

const server = app.listen(env.PORT, () => {
  logger.info(`MoneyLens API listening on http://localhost:${env.PORT}`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
