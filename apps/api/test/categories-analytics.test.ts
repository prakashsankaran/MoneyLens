import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  CategoryAnalytics,
  CategoryNode,
  MerchantAnalytics,
  MonthlyAnalytics,
  TrendAnalytics,
} from '@moneylens/types';
import { DEMO_PASSWORD, seedDemoUser } from '../prisma/seed';
import { createTestContext, registerUser } from './helpers';

const { app, prisma } = createTestContext();
const EMAIL = 'analytics-demo@example.test';
let token = '';

beforeAll(async () => {
  await seedDemoUser(prisma, { endMonth: '2026-09', email: EMAIL });
  token = (
    await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: DEMO_PASSWORD })
      .expect(200)
  ).body.data.accessToken;
});
afterAll(async () => {
  await prisma.$disconnect();
});

const auth = (t = token) => ({ Authorization: `Bearer ${t}` });
const get = async <T>(path: string, t = token): Promise<T> =>
  (await request(app).get(path).set(auth(t)).expect(200)).body.data;

describe('categories', () => {
  it('creates, renames and deletes custom categories', async () => {
    const user = await registerUser(app);
    const tree = await get<CategoryNode[]>('/api/categories', user.accessToken);
    const food = tree.find((c) => c.slug === 'food')!;
    expect(food.isSystem).toBe(true);

    const top = await request(app)
      .post('/api/categories')
      .set(auth(user.accessToken))
      .send({ name: 'Pets & Vet' })
      .expect(201);
    expect(top.body.data).toMatchObject({ slug: 'pets-and-vet', isSystem: false, parentId: null });

    const sub = await request(app)
      .post('/api/categories')
      .set(auth(user.accessToken))
      .send({ name: 'Tiffin', parentId: food.id })
      .expect(201);

    // Duplicate names among siblings (including built-ins) are refused.
    await request(app)
      .post('/api/categories')
      .set(auth(user.accessToken))
      .send({ name: 'Groceries', parentId: food.id })
      .expect(409);
    // Only two levels.
    await request(app)
      .post('/api/categories')
      .set(auth(user.accessToken))
      .send({ name: 'Deeper', parentId: sub.body.data.id })
      .expect(400);

    await request(app)
      .patch(`/api/categories/${sub.body.data.id}`)
      .set(auth(user.accessToken))
      .send({ name: 'Dabba' })
      .expect(200);
    const after = await get<CategoryNode[]>('/api/categories', user.accessToken);
    expect(after.find((c) => c.slug === 'food')!.children.map((c) => c.name)).toContain('Dabba');

    await request(app)
      .delete(`/api/categories/${top.body.data.id}`)
      .set(auth(user.accessToken))
      .expect(200);
    const final = await get<CategoryNode[]>('/api/categories', user.accessToken);
    expect(final.find((c) => c.slug === 'pets-and-vet')).toBeUndefined();
  });

  it('protects built-in and other users’ categories', async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const tree = await get<CategoryNode[]>('/api/categories', a.accessToken);
    const food = tree.find((c) => c.slug === 'food')!;
    await request(app).delete(`/api/categories/${food.id}`).set(auth(a.accessToken)).expect(403);
    await request(app)
      .patch(`/api/categories/${food.id}`)
      .set(auth(a.accessToken))
      .send({ name: 'X' })
      .expect(403);

    const mine = await request(app)
      .post('/api/categories')
      .set(auth(a.accessToken))
      .send({ name: 'Private' })
      .expect(201);
    const bTree = await get<CategoryNode[]>('/api/categories', b.accessToken);
    expect(bTree.find((c) => c.id === mine.body.data.id)).toBeUndefined();
    await request(app)
      .delete(`/api/categories/${mine.body.data.id}`)
      .set(auth(b.accessToken))
      .expect(404);
  });
});

describe('analytics', () => {
  it('summarises a month with a comparison to the previous one', async () => {
    const data = await get<MonthlyAnalytics>('/api/analytics/monthly');
    expect(data.month).toBe('2026-09');
    expect(data.availableMonths).toContain('2026-04');
    expect(data.totals.spendingPaise).toBeGreaterThan(0);
    expect(data.comparison?.previousMonth).toBe('2026-08');

    const first = await get<MonthlyAnalytics>('/api/analytics/monthly?month=2026-04');
    expect(first.comparison).toBeNull();
  });

  it('breaks spending down by category and drills into subcategories', async () => {
    const top = await get<CategoryAnalytics>('/api/analytics/categories?month=2026-09');
    const total = top.items.reduce((s, i) => s + i.amountPaise, 0);
    const monthly = await get<MonthlyAnalytics>('/api/analytics/monthly?month=2026-09');
    expect(total).toBe(monthly.totals.spendingPaise);

    const food = top.items.find((i) => i.slug === 'food')!;
    const drill = await get<CategoryAnalytics>(
      `/api/analytics/categories?month=2026-09&parentId=${food.categoryId}`,
    );
    expect(drill.parent?.slug).toBe('food');
    expect(drill.items.reduce((s, i) => s + i.amountPaise, 0)).toBe(food.amountPaise);
    expect(drill.items.map((i) => i.slug)).toContain('food-delivery');
  });

  it('ranks merchants and returns a trend', async () => {
    const merchants = await get<MerchantAnalytics>(
      '/api/analytics/merchants?month=2026-09&limit=3',
    );
    expect(merchants.items).toHaveLength(3);
    expect(merchants.items[0]!.amountPaise).toBeGreaterThanOrEqual(merchants.items[1]!.amountPaise);

    const trend = await get<TrendAnalytics>('/api/analytics/trends?months=6');
    expect(trend.points.map((p) => p.month)).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
  });

  it('validates parameters and isolates users', async () => {
    await request(app).get('/api/analytics/trends?months=99').set(auth()).expect(400);
    await request(app).get('/api/analytics/monthly?month=2026-13').set(auth()).expect(400);
    const other = await registerUser(app);
    const data = await get<MonthlyAnalytics>('/api/analytics/monthly', other.accessToken);
    expect(data.availableMonths).toEqual([]);
    expect(data.totals.spendingPaise).toBe(0);
  });
});

describe('DELETE /api/auth/account', () => {
  it('requires the password, then removes the user and their data', async () => {
    const user = await registerUser(app);
    await prisma.transaction.create({
      data: {
        userId: user.userId,
        transactionDate: new Date(),
        amount: '10.00',
        transactionType: 'DEBIT',
        flow: 'OUT',
        source: 'MANUAL',
      },
    });

    await request(app)
      .delete('/api/auth/account')
      .set(auth(user.accessToken))
      .send({ password: 'wrong password here' })
      .expect(400);

    const res = await request(app)
      .delete('/api/auth/account')
      .set(auth(user.accessToken))
      .send({ password: user.password })
      .expect(200);
    expect(String(res.headers['set-cookie'])).toMatch(/ml_rt=;/);

    expect(await prisma.user.findUnique({ where: { id: user.userId } })).toBeNull();
    expect(await prisma.transaction.count({ where: { userId: user.userId } })).toBe(0);
    await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(401);
  });
});
