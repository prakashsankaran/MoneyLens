import { describe, expect, it } from 'vitest';
import { istDate } from '@moneylens/shared';
import { budgetStatus, monthProgress } from './budgets';
import { healthScore } from './health';
import { generateInsights } from './insights';
import { planCategories, tx } from './test-helpers';

const sept = (day: number, amountPaise: number, categoryId: string, extra = {}) =>
  tx({ amountPaise, categoryId, date: istDate(2026, 9, day, 12), ...extra });

const txs = [
  sept(2, 300_000, 'food-delivery'),
  sept(5, 400_000, 'groceries'),
  sept(9, 50_000, 'groceries', { type: 'REFUND', flow: 'IN' }),
  sept(10, 450_000, 'cab'),
  sept(12, 200_000, 'shopping'),
];

describe('monthProgress', () => {
  it('counts IST days passed', () => {
    expect(monthProgress('2026-09', istDate(2026, 9, 10, 8))).toEqual({
      daysElapsed: 10,
      daysInMonth: 30,
    });
    expect(monthProgress('2026-09', istDate(2026, 10, 2))).toEqual({
      daysElapsed: 30,
      daysInMonth: 30,
    });
  });
});

describe('budgetStatus', () => {
  const budgets = [
    { id: 'b1', categoryId: 'food', amountPaise: 800_000 },
    { id: 'b2', categoryId: 'cab', amountPaise: 400_000 },
    { id: 'b3', categoryId: 'fuel', amountPaise: 300_000 },
  ];

  it('compares spending (after refunds, including subcategories) with each budget', () => {
    const s = budgetStatus(budgets, txs, planCategories, '2026-09', istDate(2026, 10, 3));
    const by = Object.fromEntries(s.items.map((i) => [i.categoryId, i]));
    expect(by['food']).toMatchObject({
      spentPaise: 650_000,
      remainingPaise: 150_000,
      usedPct: 81.3,
      status: 'near',
      projectedPaise: null,
    });
    expect(by['cab']).toMatchObject({
      spentPaise: 450_000,
      remainingPaise: -50_000,
      status: 'over',
    });
    expect(by['fuel']).toMatchObject({ spentPaise: 0, status: 'under' });
    expect(s.items[0]?.categoryId).toBe('cab');
    expect(s).toMatchObject({
      totalBudgetPaise: 1_500_000,
      totalSpentPaise: 1_300_000,
      unbudgetedSpendingPaise: 200_000,
    });
  });

  it('projects the month in progress in a straight line', () => {
    const s = budgetStatus(budgets, txs, planCategories, '2026-09', istDate(2026, 9, 15, 20));
    expect(s.daysElapsed).toBe(15);
    expect(s.items.find((i) => i.categoryId === 'food')?.projectedPaise).toBe(1_300_000);
  });
});

describe('budgets in the health score and insights', () => {
  const budgets = [
    { id: 'b1', categoryId: 'food', amountPaise: 800_000 },
    { id: 'b2', categoryId: 'cab', amountPaise: 400_000 },
  ];

  it('scores the share of budgets kept', () => {
    const h = healthScore({
      month: '2026-09',
      txs,
      categories: planCategories,
      recurring: [],
      budgets,
      now: istDate(2026, 10, 3),
    });
    // 1 of 2 kept = 50% → 0 on a line from 50% (0) to 100% (100).
    expect(h.components.find((c) => c.key === 'budget')).toMatchObject({
      score: 0,
      weight: 0.1,
      measured: '1 of 2 budgets kept',
    });
  });

  it('reports budgets that are over or on course to go over', () => {
    const over = generateInsights({
      month: '2026-09',
      txs,
      categories: planCategories,
      recurring: [],
      budgets,
      now: istDate(2026, 10, 3),
    }).insights.filter((i) => i.group === 'planning');
    expect(over.map((i) => i.title)).toEqual(['Cab is ₹500 over its ₹4,000 budget']);

    const pace = generateInsights({
      month: '2026-09',
      txs,
      categories: planCategories,
      recurring: [],
      budgets,
      now: istDate(2026, 9, 12, 20),
    }).insights.filter((i) => i.rule === 'budget-pace');
    expect(pace.map((i) => i.title)).toEqual(['Food is on course to pass its ₹8,000 budget']);
  });
});
