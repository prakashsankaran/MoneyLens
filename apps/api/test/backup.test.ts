import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BackupStatus, CategoryNode, RestoreResult, TransactionList } from '@moneylens/types';
import type { BackupFile } from '@moneylens/validation';
import { DEMO_PASSWORD, seedDemoUser } from '../prisma/seed';
import { createTestContext, registerUser } from './helpers';

const { app, prisma } = createTestContext();
const SOURCE_EMAIL = `backup-source-${Date.now()}@example.test`;
let source = '';
let seeded = 0;

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

beforeAll(async () => {
  seeded = (await seedDemoUser(prisma, { endMonth: '2026-09', email: SOURCE_EMAIL }))
    .transactionCount;
  source = (
    await request(app)
      .post('/api/auth/login')
      .send({ email: SOURCE_EMAIL, password: DEMO_PASSWORD })
      .expect(200)
  ).body.data.accessToken;
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: SOURCE_EMAIL } });
  await prisma.$disconnect();
});

async function exportBackup(token: string): Promise<BackupFile> {
  return (await request(app).get('/api/backup').set(auth(token)).expect(200)).body.data;
}
function restore(token: string, backup: unknown, replace?: string) {
  const req = request(app)
    .post('/api/backup/restore')
    .set(auth(token))
    .attach('file', Buffer.from(JSON.stringify(backup)), 'moneylens-backup.json');
  return replace === undefined ? req : req.field('replace', replace);
}
async function totals(token: string) {
  const list: TransactionList = (
    await request(app).get('/api/transactions?pageSize=1').set(auth(token)).expect(200)
  ).body.data;
  return { total: list.total, summary: list.summary };
}
async function tree(token: string): Promise<CategoryNode[]> {
  return (await request(app).get('/api/categories').set(auth(token)).expect(200)).body.data;
}

describe('backup and restore', () => {
  it('moves everything to another account, with the same totals', async () => {
    // Something of every kind: a custom subcategory, a rule through it, a
    // budget, a money plan and a dismissed recurring payment.
    const food = (await tree(source)).find((c) => c.slug === 'food') as CategoryNode;
    const custom = (
      await request(app)
        .post('/api/categories')
        .set(auth(source))
        .send({ name: 'Office lunches', parentId: food.id })
        .expect(201)
    ).body.data;
    const someTx = (
      await request(app).get('/api/transactions?q=swiggy&pageSize=1').set(auth(source)).expect(200)
    ).body.data.items[0];
    await request(app)
      .patch(`/api/transactions/${someTx.id}`)
      .set(auth(source))
      .send({ categoryId: custom.id, applyToMerchant: true, notes: 'team lunch' })
      .expect(200);
    await request(app)
      .put('/api/budgets/2026-09')
      .set(auth(source))
      .send({ items: [{ categoryId: food.id, amount: '12000' }] })
      .expect(200);
    await request(app)
      .post('/api/money-plan')
      .set(auth(source))
      .send({ monthlyIncome: '150000', savingsTarget: '30000' })
      .expect(200);
    const recurring = (await request(app).get('/api/recurring').set(auth(source)).expect(200)).body
      .data;
    const series = (recurring.items ?? recurring)[0];
    await request(app)
      .patch(`/api/recurring/${series.id}`)
      .set(auth(source))
      .send({ dismissed: true })
      .expect(200);

    const backup = await exportBackup(source);
    expect(backup.format).toBe('moneylens-backup');
    expect(backup.transactions).toHaveLength(seeded);
    expect(backup.categories.map((c) => c.name)).toEqual(['Office lunches']);
    expect(backup.categories[0]?.parent).toBe('system:food');
    expect(backup.dismissedRecurring).toHaveLength(1);
    // Nothing about signing in is in the file.
    expect(JSON.stringify(backup)).not.toMatch(/passwordHash|recoveryKey|tokenHash/);

    const target = await registerUser(app);
    const status: BackupStatus = (
      await request(app).get('/api/backup/status').set(auth(target.accessToken)).expect(200)
    ).body.data;
    expect(status).toEqual({ transactions: 0, imports: 0 });

    const result: RestoreResult = (await restore(target.accessToken, backup).expect(200)).body.data;
    expect(result).toMatchObject({ transactions: seeded, categories: 1, replaced: false });

    expect(await totals(target.accessToken)).toEqual(await totals(source));
    const lunches = (await tree(target.accessToken))
      .find((c) => c.slug === 'food')
      ?.children.find((c) => c.name === 'Office lunches');
    expect(lunches).toBeDefined();
    expect(lunches?.id).not.toBe(custom.id);
    const moved = (
      await request(app)
        .get(`/api/transactions?categoryId=${lunches?.id}&pageSize=100`)
        .set(auth(target.accessToken))
        .expect(200)
    ).body.data as TransactionList;
    expect(moved.total).toBeGreaterThan(0);
    expect(moved.items.some((t) => t.notes === 'team lunch')).toBe(true);

    const budgets = (
      await request(app).get('/api/budgets?month=2026-09').set(auth(target.accessToken)).expect(200)
    ).body.data;
    expect(JSON.stringify(budgets)).toContain('1200000');
    const plan = (await request(app).get('/api/money-plan').set(auth(target.accessToken))).body
      .data;
    expect(JSON.stringify(plan)).toContain('15000000');
    const dismissed = await prisma.recurringPayment.count({
      where: { userId: target.userId, dismissedAt: { not: null } },
    });
    expect(dismissed).toBe(1);

    // A second export from the new account carries the same history.
    const again = await exportBackup(target.accessToken);
    // Ids differ between accounts; custom category refs carry the id.
    const customRef = (ref: string | null) => (ref?.startsWith('custom:') ? 'custom' : ref);
    const strip = (b: BackupFile) =>
      b.transactions.map(({ merchantId: _m, ...t }) => ({
        ...t,
        category: customRef(t.category),
        subcategory: customRef(t.subcategory),
      }));
    expect(strip(again)).toEqual(strip(backup));
    expect(again.rules.length).toBe(backup.rules.length);
    await prisma.user.delete({ where: { id: target.userId } });
  });

  it('only replaces existing data after a typed confirmation', async () => {
    const backup = await exportBackup(source);
    const target = await registerUser(app);
    await restore(target.accessToken, backup).expect(200);

    const conflict = await restore(target.accessToken, backup).expect(409);
    expect(conflict.body.error.details).toMatchObject({ reason: 'HAS_DATA', transactions: seeded });
    await restore(target.accessToken, backup, 'yes').expect(400);

    const result: RestoreResult = (await restore(target.accessToken, backup, 'REPLACE').expect(200))
      .body.data;
    expect(result.replaced).toBe(true);
    // Replaced, not doubled.
    expect((await totals(target.accessToken)).total).toBe(seeded);
    await prisma.user.delete({ where: { id: target.userId } });
  });

  it('refuses files that are not a backup, and leaves the account unchanged', async () => {
    const target = await registerUser(app);
    const notJson = await request(app)
      .post('/api/backup/restore')
      .set(auth(target.accessToken))
      .attach('file', Buffer.from('Date,Amount\n'), 'statement.csv')
      .expect(400);
    expect(notJson.body.error.message).toMatch(/not a MoneyLens backup/);

    const wrong = await restore(target.accessToken, { format: 'something-else' }).expect(400);
    expect(wrong.body.error.message).toMatch(/not a MoneyLens backup/);

    const backup = await exportBackup(source);
    const newer = await restore(target.accessToken, { ...backup, version: 2 }).expect(400);
    expect(newer.body.error.message).toMatch(/newer version/);

    const damaged = structuredClone(backup);
    (damaged.transactions[0] as { amount: string }).amount = 'lots';
    await restore(target.accessToken, damaged).expect(400);
    expect((await totals(target.accessToken)).total).toBe(0);

    await request(app).get('/api/backup').expect(401);
    await prisma.user.delete({ where: { id: target.userId } });
  });
});

describe('npm run move-data', () => {
  it('copies one account into another and leaves the first unchanged', async () => {
    const { copyAccountData, planAccountCopy } =
      await import('../src/modules/backup/backup.service');
    const target = await registerUser(app);
    const plan = await planAccountCopy(prisma, SOURCE_EMAIL, target.email);
    expect(plan).toEqual({
      from: { email: SOURCE_EMAIL, transactions: seeded },
      to: { email: target.email, transactions: 0, imports: 0 },
    });
    await expect(planAccountCopy(prisma, SOURCE_EMAIL, SOURCE_EMAIL)).rejects.toThrow(/different/);
    await expect(planAccountCopy(prisma, 'nobody@example.test', target.email)).rejects.toThrow(
      /no account/,
    );

    const result = await copyAccountData(prisma, SOURCE_EMAIL, target.email, { replace: false });
    expect(result.transactions).toBe(seeded);
    expect(await totals(target.accessToken)).toEqual(await totals(source));
    expect((await totals(source)).total).toBe(seeded);
    await prisma.user.delete({ where: { id: target.userId } });
  });
});
