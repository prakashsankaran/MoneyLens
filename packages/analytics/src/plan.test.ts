import { describe, expect, it } from 'vitest';
import { istDate } from '@moneylens/shared';
import type { AnalyticsTransaction, FinancialProfileData } from '@moneylens/types';
import {
  baselineMonths,
  buildMoneyPlan,
  observedBaseline,
  PLAN_DISCLAIMER,
  spendingKind,
} from './plan';
import { planCategories, tx } from './test-helpers';

const byId = new Map(planCategories.map((c) => [c.id, c]));

/** The same month of spending repeated for July–September 2026. */
function threeMonths(): AnalyticsTransaction[] {
  return [7, 8, 9].flatMap((m) => [
    tx({ type: 'CREDIT', flow: 'IN', amountPaise: 10_000_000, date: istDate(2026, m, 1, 9) }),
    tx({ amountPaise: 3_000_000, categoryId: 'rent', date: istDate(2026, m, 2, 9) }),
    tx({ amountPaise: 1_000_000, categoryId: 'sip', date: istDate(2026, m, 5, 9) }),
    tx({ amountPaise: 1_200_000, categoryId: 'groceries', date: istDate(2026, m, 8, 9) }),
    tx({ amountPaise: 600_000, categoryId: 'food-delivery', date: istDate(2026, m, 10, 9) }),
    tx({ amountPaise: 400_000, categoryId: 'cab', date: istDate(2026, m, 12, 9) }),
    tx({
      amountPaise: 500_000,
      categoryId: 'family-transfer',
      type: 'TRANSFER',
      date: istDate(2026, m, 15, 9),
    }),
  ]);
}

const profile = (o: Partial<FinancialProfileData> = {}): FinancialProfileData => ({
  monthlyIncomePaise: 10_000_000,
  fixedExpensesPaise: 3_000_000,
  emisPaise: null,
  insurancePaise: null,
  investmentsPaise: 1_000_000,
  savingsTargetPaise: null,
  emergencyFundTargetPaise: null,
  emergencyFundCurrentPaise: null,
  upcomingExpenses: [],
  updatedAt: null,
  ...o,
});

const baseline = () =>
  observedBaseline(threeMonths(), planCategories, ['2026-07', '2026-08', '2026-09']);

describe('spendingKind', () => {
  it('sorts categories by their own slug first, then their parent', () => {
    expect(spendingKind('rent', byId)).toBe('commitment');
    expect(spendingKind('emi', byId)).toBe('commitment');
    expect(spendingKind('financial', byId)).toBe('commitment');
    expect(spendingKind('sip', byId)).toBe('investing');
    expect(spendingKind('groceries', byId)).toBe('essential');
    expect(spendingKind('fuel', byId)).toBe('essential');
    expect(spendingKind('cab', byId)).toBe('lifestyle');
    expect(spendingKind('food-delivery', byId)).toBe('lifestyle');
    expect(spendingKind('shopping', byId)).toBe('lifestyle');
    expect(spendingKind('family-transfer', byId)).toBe('other');
    expect(spendingKind(null, byId)).toBe('other');
  });
});

describe('baselineMonths', () => {
  it('prefers complete months before the current one', () => {
    expect(
      baselineMonths(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'], '2026-10'),
    ).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(baselineMonths(['2026-10'], '2026-10')).toEqual(['2026-10']);
  });
});

describe('observedBaseline', () => {
  it('averages each kind of spending per month', () => {
    const b = baseline();
    expect(b).toMatchObject({
      incomePaise: 10_000_000,
      commitmentsPaise: 3_000_000,
      investingPaise: 1_000_000,
      essentialPaise: 1_200_000,
      lifestylePaise: 1_000_000,
      otherPaise: 500_000,
      spendingPaise: 6_700_000,
    });
    expect(b.categories.find((c) => c.categoryId === 'cab')).toMatchObject({
      kind: 'lifestyle',
      averagePaise: 400_000,
    });
  });
});

describe('buildMoneyPlan', () => {
  it('needs the monthly income, and mentions the observed figure', () => {
    const plan = buildMoneyPlan({ profile: null, baseline: baseline(), currentMonth: '2026-10' });
    expect(plan).toMatchObject({ ready: false, status: 'incomplete', missing: ['monthlyIncome'] });
    expect(plan.suggestions[0]?.text).toContain('₹1,00,000');
  });

  it('subtracts commitments, spending and investments to find the surplus', () => {
    const plan = buildMoneyPlan({
      profile: profile(),
      baseline: baseline(),
      currentMonth: '2026-10',
    });
    expect(plan.breakdown.map((l) => [l.key, l.amountPaise, l.source])).toEqual([
      ['income', 10_000_000, 'ENTERED'],
      ['commitments', 3_000_000, 'ENTERED'],
      ['essential', 1_200_000, 'OBSERVED'],
      ['lifestyle', 1_000_000, 'OBSERVED'],
      ['other', 500_000, 'OBSERVED'],
      ['investments', 1_000_000, 'ENTERED'],
      ['surplus', 3_300_000, 'CALCULATED'],
    ]);
    expect(plan.status).toBe('on-track');
    expect(plan.disclaimer).toBe(PLAN_DISCLAIMER);
    // No goals: suggests deciding where the surplus goes, and an emergency fund range.
    expect(plan.suggestions.map((s) => s.kind)).toEqual(['RECOMMENDATION', 'RECOMMENDATION']);
    expect(plan.suggestions[0]?.text).toContain('About ₹33,000 a month is left');
    expect(plan.suggestions[1]?.text).toContain('₹1,26,000 to ₹2,52,000');
  });

  it('uses observed commitments and investments when they are not entered', () => {
    const plan = buildMoneyPlan({
      profile: profile({ fixedExpensesPaise: null, investmentsPaise: null }),
      baseline: baseline(),
      currentMonth: '2026-10',
    });
    const commitments = plan.breakdown.find((l) => l.key === 'commitments');
    expect(commitments).toMatchObject({ amountPaise: 3_000_000, source: 'OBSERVED' });
    expect(commitments?.note).toContain('3-month average');
  });

  it('turns goals into monthly amounts', () => {
    const plan = buildMoneyPlan({
      profile: profile({
        savingsTargetPaise: 1_000_000,
        emergencyFundTargetPaise: 30_000_000,
        emergencyFundCurrentPaise: 6_000_000,
        upcomingExpenses: [
          { label: 'Laptop', amountPaise: 9_000_000, dueMonth: '2027-01' },
          { label: 'Phone', amountPaise: 2_000_000, dueMonth: '2026-10' },
        ],
      }),
      baseline: baseline(),
      currentMonth: '2026-10',
    });
    expect(plan.goals.map((g) => [g.key, g.amountPaise])).toEqual([
      ['savings', 1_000_000],
      ['emergency', 2_000_000], // ₹2,40,000 still to save over 12 months
      ['upcoming:0', 3_000_000], // ₹90,000 over 3 months
    ]);
    // 33,000 surplus − 60,000 of goals
    expect(plan.afterGoalsPaise).toBe(-2_700_000);
    expect(plan.status).toBe('shortfall');
    expect(plan.suggestions.some((s) => s.text.includes('Phone is due this month'))).toBe(true);
    expect(plan.suggestions.some((s) => s.text.includes('more than half your lifestyle'))).toBe(
      true,
    );
  });

  it('suggests budgets, cutting lifestyle spending when goals do not fit', () => {
    const plan = buildMoneyPlan({
      profile: profile({ savingsTargetPaise: 3_600_000 }),
      baseline: baseline(),
      currentMonth: '2026-10',
    });
    // Short by ₹3,000; lifestyle is ₹10,000, so a 30% cut.
    expect(plan.afterGoalsPaise).toBe(-300_000);
    const budgets = Object.fromEntries(plan.suggestedBudgets.map((b) => [b.categoryId, b]));
    expect(budgets['groceries']?.suggestedPaise).toBe(1_200_000);
    expect(budgets['food-delivery']).toMatchObject({ suggestedPaise: 420_000 });
    expect(budgets['food-delivery']?.reason).toContain('30% below your average');
    expect(budgets['cab']?.suggestedPaise).toBe(280_000);
    expect(budgets['rent']).toBeUndefined();
    expect(plan.suggestions[0]?.text).toContain('fall by about ₹3,000 a month (30%');
  });

  it('flags entered figures that differ from the transactions', () => {
    const plan = buildMoneyPlan({
      profile: profile({ monthlyIncomePaise: 20_000_000, fixedExpensesPaise: 1_000_000 }),
      baseline: baseline(),
      currentMonth: '2026-10',
    });
    const texts = plan.suggestions.map((s) => s.text).join(' ');
    expect(texts).toContain('more than the ₹10,000 you entered');
    expect(texts).toContain('differs from the ₹1,00,000 a month');
  });
});
