import { describe, expect, it } from 'vitest';
import { MemoryPrismaClient } from '../src/backend/prisma/client';
import type { MemDecimal } from '../src/backend/prisma/decimal';
import { MemoryDatabase } from '../src/backend/prisma/engine';
import { deserialize, serialize } from '../src/backend/storage';

describe('saving the on-device database', () => {
  it('restores dates, amounts and JSON exactly', async () => {
    const db = new MemoryDatabase();
    const prisma = new MemoryPrismaClient({ db }) as never as Record<
      string,
      { create(a: unknown): Promise<{ id: string }> }
    >;
    const user = await prisma.user!.create({
      data: { email: 'a@b.c', name: 'A', passwordHash: 'x' },
    });
    await prisma.transaction!.create({
      data: {
        userId: user.id,
        transactionDate: new Date('2026-09-15T10:00:00Z'),
        amount: '649.00',
        transactionType: 'DEBIT',
        flow: 'OUT',
        source: 'CSV',
      },
    });
    await prisma.import!.create({
      data: {
        userId: user.id,
        originalFilename: 's.csv',
        mimeType: 'text/csv',
        sizeBytes: 10,
        sha256: 'abc',
        source: 'CSV',
        warnings: ['Read the sheet "Transactions".'],
      },
    });

    const restored = new MemoryDatabase();
    deserialize(restored, serialize(db));
    const [tx] = [...restored.table('Transaction').values()];
    expect(tx?.transactionDate).toEqual(new Date('2026-09-15T10:00:00Z'));
    expect((tx?.amount as MemDecimal).toFixed(2)).toBe('649.00');
    expect([...restored.table('Import').values()][0]?.warnings).toEqual([
      'Read the sheet "Transactions".',
    ]);
    const tables = (text: string) => (JSON.parse(text) as { tables: unknown }).tables;
    expect(tables(serialize(restored))).toEqual(tables(serialize(db)));
  });
});
