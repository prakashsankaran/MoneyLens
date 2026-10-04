import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vitest/config';

const testEnv = parseEnv(
  readFileSync(fileURLToPath(new URL('./.env.test', import.meta.url)), 'utf8'),
) as Record<string, string>;

export default defineConfig({
  test: {
    name: 'api',
    root: fileURLToPath(new URL('.', import.meta.url)),
    include: ['src/**/*.test.ts', 'test/**/*.test.ts', 'prisma/**/*.test.ts'],
    environment: 'node',
    env: testEnv,
    globalSetup: ['./test/global-setup.ts'],
    // Integration tests share one database; run files sequentially.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
