import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  BudgetsResponse,
  CategoryNode,
  HealthScore,
  InsightsResponse,
  MoneyPlanResponse,
  SimulationResult,
} from '@moneylens/types';
import { DEMO_PASSWORD, seedDemoUser } from '../prisma/seed';
import { createTestContext, registerUser } from './helpers';

const { app, prisma } = createTestContext();
const DEMO_EMAIL = 'plan-demo@example.test';
let token = '';
let categories: CategoryNode[] = [];
const idOf = (slug: string) => {
  for (const c of categories) {
    if (c.slug === slug) return c.id;
    const child = c.children.find((x) => x.slug === slug);
    if (child) return child.id;
  }
  throw new Error(`No category ${slug}`);
};

beforeAll(async () => {
  await seedDemoUser(prisma, { endMonth: '2026-09', email: DEMO_EMAIL });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
    .expect(200);
  token = res.body.data.accessToken;
  categories = await get<CategoryNode[]>('/api/categories');
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function get<T>(path: string, auth = token): Promise<T> {
  const res = await request(app).get(path).set('Authorization', `Bearer ${auth}`).expect(200);
  return res.body.data;
}

function send(method: 'post' | 'patch' | 'put', path: string, body: object, auth = token) {
  return request(app)[method](path).set('Authorization', `Bearer ${auth}`).send(body);
}

describe('authentication', () => {
  it.each([
    ['get', '/api/money-plan'],
    ['post', '/api/money-plan'],
    ['post', '/api/money-plan/simulate'],
    ['get', '/api/budgets'],
    ['put', '/api/budgets/2026-09'],
  ] as const)('%s %s requires a signed-in user', async (method, path) => {
    await request(app)[method](path).expect(401);
  });
});

describe('money plan', () => {
  it('starts incomplete, with averages from the transactions', async () => {
    const data = await get<MoneyPlanResponse>('/api/money-plan');
    expect(data.profile).toBeNull();
    expect(data.plan.status).toBe('incomplete');
    expect(data.plan.baseline.months).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(data.plan.baseline.incomePaise).toBe(14_500_000);
    expect(data.plan.baseline.commitmentsPaise).toBeGreaterThan(3_200_000);
  });

  it('saves the profile and calculates the plan', async () => {
    const res = await send('post', '/api/money-plan', {
      monthlyIncome: '1,45,000',
      fixedExpenses: '32000',
      insurance: '2450',
      investments: '10000',
      savingsTarget: '20000',
      emergencyFundTarget: '3,00,000',
      emergencyFundCurrent: '60000',
      upcomingExpenses: [{ label: 'Laptop', amount: '90000', dueMonth: '2099-01' }],
    }).expect(200);
    const data: MoneyPlanResponse = res.body.data;
    expect(data.profile).toMatchObject({
      monthlyIncomePaise: 14_500_000,
      fixedExpensesPaise: 3_200_000,
      emisPaise: null,
      upcomingExpenses: [{ label: 'Laptop', amountPaise: 9_000_000, dueMonth: '2099-01' }],
    });
    expect(data.savedAt).not.toBeNull();
    const surplus = data.plan.breakdown.at(-1);
    expect(surplus?.key).toBe('surplus');
    const deductions = data.plan.breakdown.slice(1, -1).reduce((a, l) => a + l.amountPaise, 0);
    expect(surplus?.amountPaise).toBe(14_500_000 - deductions);
    expect(data.plan.goals.map((g) => g.key)).toEqual(['savings', 'emergency', 'upcoming:0']);
    expect(data.plan.disclaimer).toContain('not professional financial advice');
    expect(await prisma.moneyPlan.count({ where: { user: { email: DEMO_EMAIL } } })).toBe(1);
  });

  it('changes only the fields sent with PATCH', async () => {
    const res = await send('patch', '/api/money-plan', { savingsTarget: '' }).expect(200);
    const data: MoneyPlanResponse = res.body.data;
    expect(data.profile).toMatchObject({
      savingsTargetPaise: null,
      monthlyIncomePaise: 14_500_000,
      emergencyFundCurrentPaise: 6_000_000,
    });
    expect(data.plan.goals.map((g) => g.key)).toEqual(['emergency', 'upcoming:0']);
  });

  it('rejects invalid amounts and never shows another user the plan', async () => {
    const bad = await send('post', '/api/money-plan', { monthlyIncome: 'lots' }).expect(400);
    expect(bad.body.error.details.fields.monthlyIncome).toBeTruthy();
    const other = await registerUser(app);
    const data = await get<MoneyPlanResponse>('/api/money-plan', other.accessToken);
    expect(data.profile).toBeNull();
    expect(data.plan.baseline.months).toEqual([]);
  });
});

describe('what-if simulator', () => {
  it('calculates monthly, annual and projected impact with the stated return', async () => {
    const res = await send('post', '/api/money-plan/simulate', {
      annualReturnPct: 6,
      adjustments: [
        { type: 'category-percent', categoryId: idOf('food'), percent: 20 },
        { type: 'save-more', amount: '5,000' },
        { type: 'income-change', amount: '-2000' },
      ],
    }).expect(200);
    const r: SimulationResult = res.body.data;
    expect(r.adjustments).toHaveLength(3);
    expect(r.adjustments[1]?.monthlyImpactPaise).toBe(500_000);
    expect(r.adjustments[2]?.monthlyImpactPaise).toBe(-200_000);
    expect(r.monthlyImpactPaise).toBe(r.adjustments.reduce((a, x) => a + x.monthlyImpactPaise, 0));
    expect(r.annualImpactPaise).toBe(r.monthlyImpactPaise * 12);
    expect(r.projections[3]?.withReturnPaise).toBeGreaterThan(
      r.projections[3]?.contributedPaise ?? 0,
    );
    expect(r.assumptions.join(' ')).toContain('6% yearly return');
  });

  it('validates the scenario', async () => {
    await send('post', '/api/money-plan/simulate', { adjustments: [] }).expect(400);
    await send('post', '/api/money-plan/simulate', {
      adjustments: [{ type: 'save-more', amount: '1000' }],
      annualReturnPct: 25,
    }).expect(400);
    await send('post', '/api/money-plan/simulate', {
      adjustments: [{ type: 'category-percent', categoryId: 'nope', percent: 10 }],
    }).expect(400);
  });
});

describe('budgets', () => {
  it('sets budgets, reports spending against them and removes them', async () => {
    const res = await send('put', '/api/budgets/2026-09', {
      items: [
        { categoryId: idOf('food'), amount: '5000' },
        { categoryId: idOf('ott'), amount: '2,000' },
      ],
    }).expect(200);
    const data: BudgetsResponse = res.body.data;
    expect(data.month).toBe('2026-09');
    expect(data.daysElapsed).toBe(30);
    const food = data.items.find((i) => i.slug === 'food');
    expect(food?.status).toBe('over');
    expect(food?.remainingPaise).toBe(500_000 - (food?.spentPaise ?? 0));
    expect(data.items.find((i) => i.slug === 'ott')?.status).toBe('under');
    expect(data.totalBudgetPaise).toBe(700_000);

    const health = await get<HealthScore>('/api/analytics/health?month=2026-09');
    expect(health.components.find((c) => c.key === 'budget')?.measured).toBe('1 of 2 budgets kept');
    const insights = await get<InsightsResponse>('/api/insights?month=2026-09');
    expect(insights.insights.some((i) => i.rule === 'budget-over')).toBe(true);

    const removed = await send('put', '/api/budgets/2026-09', {
      items: [{ categoryId: idOf('ott'), amount: null }],
    }).expect(200);
    expect(removed.body.data.items.map((i: { slug: string }) => i.slug)).toEqual(['food']);
  });

  it('keeps budgets per user and checks the category and month', async () => {
    const other = await registerUser(app);
    const list = await get<BudgetsResponse>('/api/budgets?month=2026-09', other.accessToken);
    expect(list.items).toEqual([]);
    await send('put', '/api/budgets/2026-13', {
      items: [{ categoryId: idOf('food'), amount: '1' }],
    }).expect(400);
    await send('put', '/api/budgets/2026-09', {
      items: [{ categoryId: 'nope', amount: '1' }],
    }).expect(400);
    await send('put', '/api/budgets/2026-09', {
      items: [{ categoryId: idOf('food'), amount: '0' }],
    }).expect(400);
  });
});
