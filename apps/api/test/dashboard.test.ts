import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DashboardData } from '@moneylens/types';
import { DEMO_PASSWORD, seedDemoUser } from '../prisma/seed';
import { createTestContext, registerUser } from './helpers';

const { app, prisma } = createTestContext();
const DEMO_EMAIL = 'dashboard-demo@example.test';
let demoToken = '';

beforeAll(async () => {
  await seedDemoUser(prisma, { endMonth: '2026-09', email: DEMO_EMAIL });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
    .expect(200);
  demoToken = res.body.data.accessToken;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function getDashboard(token: string, query = ''): Promise<DashboardData> {
  const res = await request(app)
    .get(`/api/dashboard${query}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  expect(res.body.success).toBe(true);
  return res.body.data;
}

describe('GET /api/dashboard', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/dashboard').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('defaults to the latest month with data and returns six months of trend', async () => {
    const data = await getDashboard(demoToken);
    expect(data.month).toBe('2026-09');
    expect(data.availableMonths).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
    expect(data.historyMonths).toBe(5);
    expect(data.trend.map((t) => t.month)).toEqual(data.availableMonths);
  });

  it('returns internally consistent totals', async () => {
    const { totals, categories, trend } = await getDashboard(demoToken);
    expect(totals.incomePaise).toBe(14_500_000);
    expect(totals.spendingPaise).toBe(totals.grossSpendingPaise - totals.refundsPaise);
    expect(totals.savedPaise).toBe(totals.incomePaise - totals.spendingPaise);
    expect(trend.at(-1)?.spendingPaise).toBe(totals.spendingPaise);

    // Category totals add up to total spending (no negative-netting categories here).
    const categorySum = categories.reduce((acc, c) => acc + c.amountPaise, 0);
    expect(categorySum).toBe(totals.spendingPaise);
    const shareSum = categories.reduce((acc, c) => acc + c.sharePct, 0);
    expect(shareSum).toBeGreaterThan(99.5);
    expect(shareSum).toBeLessThan(100.5);

    // Self transfers are not counted as spending.
    expect(categories.find((c) => c.slug === 'transfers')?.amountPaise).toBe(800_000);
  });

  it('explains the rise in food delivery with supporting transactions', async () => {
    const { observations } = await getDashboard(demoToken);
    const food = observations.find((o) => o.id === 'category-above-average:food-delivery');
    expect(food).toBeDefined();
    expect(food?.kind).toBe('OBSERVATION');
    expect(food?.supportingTransactionIds.length).toBeGreaterThan(0);

    const supporting = await prisma.transaction.findMany({
      where: { id: { in: food?.supportingTransactionIds ?? [] } },
      include: { subcategory: true },
    });
    expect(supporting.every((t) => t.subcategory?.slug === 'food-delivery')).toBe(true);
  });

  it('supports choosing an earlier month', async () => {
    const data = await getDashboard(demoToken, '?month=2026-06');
    expect(data.month).toBe('2026-06');
    expect(data.trend.map((t) => t.month)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
    expect(data.trend.slice(0, 3).every((t) => t.spendingPaise === 0)).toBe(true);
    expect(data.comparison?.previousMonth).toBe('2026-05');
  });

  it('has no comparison for the first month of data', async () => {
    const data = await getDashboard(demoToken, '?month=2026-04');
    expect(data.comparison).toBeNull();
  });

  it('rejects an invalid month', async () => {
    const res = await request(app)
      .get('/api/dashboard?month=2026-13')
      .set('Authorization', `Bearer ${demoToken}`)
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it("never shows one user another user's data", async () => {
    const other = await registerUser(app);
    const data = await getDashboard(other.accessToken, '?month=2026-09');
    expect(data.availableMonths).toEqual([]);
    expect(data.totals.spendingPaise).toBe(0);
    expect(data.categories).toEqual([]);
    expect(data.topMerchants).toEqual([]);
    expect(data.observations).toEqual([]);
    expect(data.comparison).toBeNull();
  });

  it('ignores user-supplied identity parameters', async () => {
    const demo = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_EMAIL } });
    const other = await registerUser(app);
    const res = await request(app)
      .get(`/api/dashboard?month=2026-09&userId=${demo.id}`)
      .set('Authorization', `Bearer ${other.accessToken}`);
    // Unknown query keys are stripped; the other user still sees only their own (empty) data.
    expect(res.status).toBe(200);
    expect(res.body.data.totals.spendingPaise).toBe(0);
  });
});

describe('GET /api/categories', () => {
  it('returns the category tree', async () => {
    const res = await request(app)
      .get('/api/categories')
      .set('Authorization', `Bearer ${demoToken}`)
      .expect(200);
    const food = res.body.data.find((c: { slug: string }) => c.slug === 'food');
    expect(food.children.map((c: { slug: string }) => c.slug)).toContain('food-delivery');
  });
});
