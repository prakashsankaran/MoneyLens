import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

/**
 * Applies pending migrations to the dedicated test database before the API
 * suite. This never drops data: tests isolate themselves by creating users
 * with unique emails, so the suite can run against a reused test database.
 */
export default function setup() {
  const apiDir = fileURLToPath(new URL('..', import.meta.url));
  const env = parseEnv(readFileSync(`${apiDir}/.env.test`, 'utf8')) as Record<string, string>;
  const url = process.env.TEST_DATABASE_URL ?? env.DATABASE_URL ?? '';
  if (!/_test\b|test\?/.test(url)) {
    throw new Error(`Refusing to reset a database that is not named *_test: ${url}`);
  }
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
