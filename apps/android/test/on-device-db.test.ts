import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript build script
import { buildSchema, SCHEMA_PATH } from '../scripts/generate-schema.mjs';
import { sqlKey } from '../src/backend/prisma/client';
import { MemDecimal } from '../src/backend/prisma/decimal';
import { MemoryDatabase } from '../src/backend/prisma/engine';
import { RAW_HANDLERS } from '../src/backend/prisma/raw';

const API_SRC = fileURLToPath(new URL('../../api/src', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
  });
}

describe('on-device database', () => {
  it('uses the current Prisma schema (run npm run generate:schema -w @moneylens/android)', () => {
    expect(JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'))).toEqual(buildSchema());
  });

  it('answers every hand-written SQL statement in the API', () => {
    const statements = sourceFiles(API_SRC).flatMap((file) =>
      [
        ...readFileSync(file, 'utf8').matchAll(/\$(?:queryRaw|executeRaw)(?:<[^`]*>)?`([^`]*)`/g),
      ].map((m) => sqlKey((m[1] as string).split(/\$\{[^}]*\}/))),
    );
    expect(statements.length).toBeGreaterThan(0);
    for (const sql of statements) expect(RAW_HANDLERS.has(sql), sql).toBe(true);
  });

  it('keeps rupee amounts exact to the paisa', () => {
    expect(new MemDecimal('1234.5').toFixed(2)).toBe('1234.50');
    expect(new MemDecimal('0.105').toFixed(2)).toBe('0.11');
    expect(new MemDecimal(19.99).toFixed(2)).toBe('19.99');
    expect(new MemDecimal('-12.30').toString()).toBe('-12.3');
  });

  it('rolls back a failed transaction', async () => {
    const { MemoryPrismaClient } = await import('../src/backend/prisma/client');
    const prisma = new MemoryPrismaClient({ db: new MemoryDatabase() }) as never as {
      user: { create(a: unknown): Promise<unknown>; count(): Promise<number> };
      $transaction(fn: (tx: unknown) => Promise<unknown>): Promise<unknown>;
    };
    await expect(
      prisma.$transaction(async () => {
        await prisma.user.create({ data: { email: 'a@b.c', name: 'A', passwordHash: 'x' } });
        throw new Error('stop');
      }),
    ).rejects.toThrow('stop');
    expect(await prisma.user.count()).toBe(0);
  });
});
