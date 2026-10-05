import { describe, expect, it } from 'vitest';
import { istDate } from '@moneylens/shared';
import type { AnalyticsTransaction, CategoryRef } from '@moneylens/types';
import { healthScore, linearScore } from './health';
import { categories as baseCategories, series, tx } from './test-helpers';

const categories: CategoryRef[] = [
  ...baseCategories,
  { id: 'fin', name: 'Financial', slug: 'financial', parentId: null, color: null, icon: null },
  { id: 'sip', name: 'SIP', slug: 'sip', parentId: 'fin', color: null, icon: null },
];

/** Income and spending for each month (2026). */
const months = (list: number[], incomePaise: number, other: number, deliveryPaise = 0) =>
  list.flatMap((m): AnalyticsTransaction[] => [
    tx({ type: 'CREDIT', flow: 'IN', amountPaise: incomePaise, date: istDate(2026, m, 1, 9) }),
    tx({ amountPaise: other, date: istDate(2026, m, 3, 9) }),
    ...(deliveryPaise
      ? [tx({ amountPaise: deliveryPaise, categoryId: 'delivery', date: istDate(2026, m, 8, 9) })]
      : []),
  ]);

const component = (h: ReturnType<typeof healthScore>, key: string) =>
  h.components.find((c) => c.key === key);

describe('linearScore', () => {
  it('runs in either direction and clamps', () => {
    expect(linearScore(10, 0, 20)).toBe(50);
    expect(linearScore(-5, 0, 20)).toBe(0);
    expect(linearScore(30, 0, 20)).toBe(100);
    expect(linearScore(40, 70, 30)).toBe(75);
  });
});

describe('healthScore', () => {
  it('scores every measurable component and shows its working', () => {
    const txs = months([4, 5, 6, 7, 8, 9], 10_000_000, 7_000_000, 1_000_000);
    const h = healthScore({
      month: '2026-09',
      txs,
      categories,
      recurring: [
        series({ label: 'Rent', monthlyEquivalentPaise: 4_000_000 }),
        series({ label: 'SIP', categoryId: 'sip', monthlyEquivalentPaise: 2_000_000 }),
        series({ label: 'Salary', flow: 'IN', monthlyEquivalentPaise: 10_000_000 }),
      ],
    });
    expect(component(h, 'savings')).toMatchObject({
      score: 100,
      measured: '20.0% of income saved (₹60,000 of ₹3,00,000, 3 months)',
    });
    expect(component(h, 'discretionary')).toMatchObject({ score: 100 });
    expect(component(h, 'cashflow')).toMatchObject({
      score: 100,
      measured: 'Income covered spending in 6 of 6 months',
    });
    expect(component(h, 'stability')?.score).toBe(100);
    // Rent counts; the SIP is saving, not an obligation.
    expect(component(h, 'obligations')).toMatchObject({
      score: 75,
      measured: '40.0% of income (₹40,000 a month of ₹1,00,000)',
    });
    expect(component(h, 'budget')).toMatchObject({ score: null, weight: 0 });
    expect(component(h, 'budget')?.unavailableReason).toContain('Phase 5');
    // (100×0.3 + 100×0.2 + 100×0.2 + 100×0.15 + 75×0.15) / 1.0 = 96.25
    expect(h.score).toBe(96);
    expect(h.monthsUsed).toHaveLength(6);
    for (const c of h.components) expect(c.formula.length).toBeGreaterThan(0);
  });

  it('rescales the weights when some components cannot be measured', () => {
    const h = healthScore({
      month: '2026-09',
      txs: months([9], 10_000_000, 9_000_000, 1_000_000),
      categories,
      recurring: [],
    });
    expect(component(h, 'cashflow')?.unavailableReason).toBe('Needs at least 3 months of data.');
    expect(component(h, 'stability')?.score).toBeNull();
    // Savings 0% → 0, discretionary 10% → 100, obligations 0% → 100.
    // (0×0.3 + 100×0.2 + 100×0.15) / 0.65 = 53.8
    expect(h.score).toBe(54);
  });

  it('gives no score when too little can be measured', () => {
    const h = healthScore({
      month: '2026-09',
      txs: [tx({ amountPaise: 50_000 })],
      categories,
      recurring: [],
    });
    expect(component(h, 'savings')?.unavailableReason).toBe(
      'No income recorded in the last 3 months.',
    );
    expect(h.score).toBeNull();
  });
});
