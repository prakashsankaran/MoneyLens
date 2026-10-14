import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vitest/config';

const apiEnv = parseEnv(
  readFileSync(fileURLToPath(new URL('../api/.env.test', import.meta.url)), 'utf8'),
) as Record<string, string>;

/**
 * Runs this app's tests and, again, the API's integration suite with the
 * on-device database standing in for Postgres. Every endpoint the phone uses
 * is therefore checked against the same expectations as the server.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@prisma/client': fileURLToPath(new URL('./src/backend/prisma/index.ts', import.meta.url)),
    },
  },
  test: {
    name: 'android',
    root: fileURLToPath(new URL('.', import.meta.url)),
    include: ['test/**/*.test.ts', '../api/test/**/*.test.ts'],
    environment: 'node',
    env: apiEnv,
    setupFiles: ['./test/setup-database.ts'],
    testTimeout: 20_000,
  },
});
