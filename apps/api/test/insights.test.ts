import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  ComparisonsResponse,
  DashboardData,
  HealthScore,
  InsightsResponse,
  MonthlyReport,
  RecurringSummary,
  TransactionList,
} from '@moneylens/types';
import { DEMO_PASSWORD, seedDemoUser } from '../prisma/seed';
import { createTestContext, registerUser } from './helpers';

const { app, prisma } = createTestContext();
const DEMO_EMAIL = 'insights-demo@example.test';
let token = '';

beforeAll(async () => {
  await seedDemoUser(prisma, { endMonth: '2026-09', email: DEMO_EMAIL });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
    .expect(200);
  token = res.body.data.accessToken;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function get<T>(path: string, auth = token): Promise<T> {
  const res = await request(app).get(path).set('Authorization', `Bearer ${auth}`).expect(200);
  expect(res.body.success).toBe(true);
  return res.body.data;
}

describe('authentication', () => {
  it.each([
    '/api/insights',
    '/api/recurring',
    '/api/reports/monthly',
    '/api/analytics/health',
    '/api/analytics/comparisons',
  ])('%s requires a signed-in user', async (path) => {
    await request(app).get(path).expect(401);
  });
});

describe('GET /api/insights', () => {
  it('returns labelled insights with their evidence, including saving opportunities', async () => {
    const data = await get<InsightsResponse>('/api/insights?month=2026-09');
    expect(data.month).toBe('2026-09');
    expect(data.historyMonths).toBe(5);
    expect(data.insights.length).toBeGreaterThan(3);
    for (const i of data.insights) {
      expect(['CALCULATION', 'OBSERVATION']).toContain(i.kind);
      expect(i.confidence).toBeGreaterThan(0);
      expect(i.title).not.toMatch(/waste/i);
    }
    const groups = new Set(data.insights.map((i) => i.group));
    expect(groups).toContain('saving');
    expect(groups).toContain('recurring');
    const saving = data.insights.filter((i) => i.group === 'saving');
    for (const s of saving) {
      expect(s.title.startsWith('Potential saving opportunity')).toBe(true);
      expect(s.assumption).toBeTruthy();
    }
  });

  it('explains which rules could not run for the first month', async () => {
    const data = await get<InsightsResponse>('/api/insights?month=2026-04');
    expect(data.historyMonths).toBe(0);
    expect(data.skipped.map((s) => s.rule)).toContain('category-increase');
  });

  it('rejects a malformed month', async () => {
    const res = await request(app)
      .get('/api/insights?month=2026-13')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('shows nothing from another user', async () => {
    const other = await registerUser(app);
    const data = await get<InsightsResponse>('/api/insights', other.accessToken);
    expect(data.insights).toEqual([]);
    const recurring = await get<RecurringSummary>('/api/recurring', other.accessToken);
    expect(recurring.items).toEqual([]);
  });
});

describe('recurring payments', () => {
  it('lists detected series and marks their transactions', async () => {
    const data = await get<RecurringSummary>('/api/recurring');
    const labels = data.items.map((i) => i.label);
    expect(labels).toEqual(expect.arrayContaining(['Netflix', 'Rent (Landlord)', 'Spotify']));
    const netflix = data.items.find((i) => i.label === 'Netflix');
    expect(netflix).toMatchObject({
      frequency: 'MONTHLY',
      typicalAmountPaise: 64_900,
      subscriptionLike: true,
      dismissed: false,
    });
    expect(data.items.find((i) => i.label === 'Rent (Landlord)')?.subscriptionLike).toBe(false);

    const list = await get<TransactionList>(
      `/api/transactions?recurring=true&merchantId=${netflix?.merchantId}&pageSize=100`,
    );
    expect(list.items.map((t) => t.id).sort()).toEqual([...(netflix?.transactionIds ?? [])].sort());
  });

  it('can dismiss a series and bring it back', async () => {
    const before = await get<RecurringSummary>('/api/recurring');
    const spotify = before.items.find((i) => i.label === 'Spotify');
    expect(spotify).toBeDefined();

    const res = await request(app)
      .patch(`/api/recurring/${spotify?.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dismissed: true })
      .expect(200);
    const after: RecurringSummary = res.body.data;
    expect(after.items.find((i) => i.id === spotify?.id)?.dismissed).toBe(true);
    expect(after.monthlyOutgoingPaise).toBe(before.monthlyOutgoingPaise - 11_900);
    const insights = await get<InsightsResponse>('/api/insights?month=2026-09');
    const subs = insights.insights.find((i) => i.rule === 'subscriptions');
    expect(subs?.explanation).not.toContain('Spotify');
    const flagged = await get<TransactionList>(
      `/api/transactions?recurring=true&merchantId=${spotify?.merchantId}`,
    );
    expect(flagged.total).toBe(0);

    await request(app)
      .patch(`/api/recurring/${spotify?.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dismissed: false })
      .expect(200);
    const restored = await get<RecurringSummary>('/api/recurring');
    expect(restored.monthlyOutgoingPaise).toBe(before.monthlyOutgoingPaise);
  });

  it("cannot change another user's series", async () => {
    const { items } = await get<RecurringSummary>('/api/recurring');
    const other = await registerUser(app);
    await request(app)
      .patch(`/api/recurring/${items[0]?.id}`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .send({ dismissed: true })
      .expect(404);
    await request(app)
      .patch(`/api/recurring/${items[0]?.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dismissed: 'yes' })
      .expect(400);
  });
});

describe('health score, comparisons and the monthly report', () => {
  it('returns an explainable health score', async () => {
    const health = await get<HealthScore>('/api/analytics/health?month=2026-09');
    expect(health.score).toBeGreaterThanOrEqual(0);
    expect(health.score).toBeLessThanOrEqual(100);
    expect(health.components.map((c) => c.key)).toEqual([
      'savings',
      'discretionary',
      'cashflow',
      'stability',
      'obligations',
      'budget',
    ]);
    for (const c of health.components) {
      expect(c.formula).toBeTruthy();
      expect(c.score === null ? c.unavailableReason : c.measured).toBeTruthy();
    }
  });

  it('compares the month with its baselines', async () => {
    const data = await get<ComparisonsResponse>('/api/analytics/comparisons?month=2026-09');
    expect(data.totals.map((r) => r.baseline)).toEqual([
      'previous-month',
      'avg-3',
      'avg-6',
      'quarter',
      'ytd',
    ]);
    expect(data.totals.find((r) => r.baseline === 'avg-6')?.baselineMonths).toBe(5);
    expect(data.patterns.byWeekday).toHaveLength(7);
    expect(data.categories.length).toBeGreaterThan(3);
  });

  it('builds the monthly report against a chosen month', async () => {
    const report = await get<MonthlyReport>('/api/reports/monthly?month=2026-09&compare=2026-06');
    expect(report.compareMonth).toBe('2026-06');
    expect(report.executiveSummary[0]?.kind).toBe('CALCULATION');
    expect(report.recommendations.every((r) => r.kind === 'RECOMMENDATION')).toBe(true);
    expect(report.incomeSources[0]?.amountPaise).toBe(14_500_000);
    await request(app)
      .get('/api/reports/monthly?month=2026-09&compare=2026-09')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('adds saving opportunities and the health score to the dashboard', async () => {
    const data = await get<DashboardData>('/api/dashboard?month=2026-09');
    expect(data.health.month).toBe('2026-09');
    expect(data.savingOpportunities.every((s) => s.group === 'saving')).toBe(true);
  });
});

describe('GET /api/transactions?ids=', () => {
  it('returns exactly the transactions behind an insight', async () => {
    const { insights } = await get<InsightsResponse>('/api/insights?month=2026-09');
    const withEvidence = insights.find((i) => i.supportingTransactionIds.length >= 2);
    const ids = withEvidence?.supportingTransactionIds.slice(0, 20) ?? [];
    const list = await get<TransactionList>(`/api/transactions?ids=${ids.join(',')}&pageSize=100`);
    expect(list.items.map((t) => t.id).sort()).toEqual([...ids].sort());
  });
});

describe('keeping recurring detection current', () => {
  it('re-detects after transactions are deleted', async () => {
    await seedDemoUser(prisma, { endMonth: '2026-09', email: 'insights-refresh@example.test' });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'insights-refresh@example.test', password: DEMO_PASSWORD })
      .expect(200);
    const auth = login.body.data.accessToken as string;
    const { items } = await get<RecurringSummary>('/api/recurring', auth);
    const spotify = items.find((i) => i.label === 'Spotify');
    const ids = spotify?.transactionIds ?? [];
    expect(ids.length).toBeGreaterThanOrEqual(5);

    // Leave two payments: too few to be a schedule.
    for (const id of ids.slice(2)) {
      await request(app)
        .delete(`/api/transactions/${id}`)
        .set('Authorization', `Bearer ${auth}`)
        .expect(200);
    }
    const flagged = await get<TransactionList>(
      `/api/transactions?recurring=true&merchantId=${spotify?.merchantId}`,
      auth,
    );
    expect(flagged.total).toBe(0);
    const after = await get<RecurringSummary>('/api/recurring', auth);
    expect(after.items.some((i) => i.label === 'Spotify')).toBe(false);
  });
});
