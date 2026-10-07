import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { loadEnv } from '../src/config/env';
import { createLogger } from '../src/lib/logger';
import type { AIProvider } from '../src/modules/ai/providers';

export function createTestContext(
  overrides: Record<string, string> = {},
  deps: { aiProvider?: AIProvider } = {},
) {
  const env = loadEnv({
    ...process.env,
    ...overrides,
    ...(process.env.TEST_DATABASE_URL ? { DATABASE_URL: process.env.TEST_DATABASE_URL } : {}),
  });
  const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  const app = createApp({ env, prisma, logger: createLogger(env), ...deps });
  return { env, prisma, app };
}

let userCounter = 0;

/** Register a fresh user and return their access token and refresh cookie. */
export async function registerUser(app: Express, overrides: { email?: string } = {}) {
  userCounter += 1;
  const email = overrides.email ?? `user${userCounter}-${Date.now()}@example.test`;
  const password = 'correct horse battery';
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: `Test User ${userCounter}`, email, password })
    .expect(201);
  return {
    email,
    password,
    userId: res.body.data.user.id as string,
    accessToken: res.body.data.accessToken as string,
    cookie: res.headers['set-cookie'] as unknown as string[],
  };
}
