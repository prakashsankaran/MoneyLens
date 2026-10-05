import { describe, expect, it } from 'vitest';
import type { ObservedBaseline } from '@moneylens/types';
import { futureValue, simulate } from './simulator';
import { planCategories } from './test-helpers';

const baseline: ObservedBaseline = {
  months: ['2026-07', '2026-08', '2026-09'],
  incomePaise: 10_000_000,
  commitmentsPaise: 3_000_000,
  investingPaise: 0,
  essentialPaise: 1_200_000,
  lifestylePaise: 1_000_000,
  otherPaise: 0,
  spendingPaise: 5_200_000,
  categories: [
    {
      categoryId: 'groceries',
      name: 'Groceries',
      slug: 'groceries',
      kind: 'essential',
      averagePaise: 1_200_000,
    },
    {
      categoryId: 'food-delivery',
      name: 'Food Delivery',
      slug: 'food-delivery',
      kind: 'lifestyle',
      averagePaise: 600_000,
    },
    {
      categoryId: 'shopping',
      name: 'Shopping',
      slug: 'shopping',
      kind: 'lifestyle',
      averagePaise: 200_000,
    },
  ],
};

describe('futureValue', () => {
  it('is the plain sum without a return, and compounds monthly with one', () => {
    expect(futureValue(100_000, 12, 0)).toBe(1_200_000);
    // 1,000 a month for a year at 12% a year (1% a month): 1000 × (1.01^12 − 1) / 0.01
    expect(futureValue(100_000, 12, 12)).toBe(1_268_250);
    expect(futureValue(-100_000, 12, 12)).toBe(-1_200_000);
  });
});

describe('simulate', () => {
  it('turns each adjustment into a monthly amount and projects it', () => {
    const r = simulate({
      baseline,
      categories: planCategories,
      annualReturnPct: 12,
      adjustments: [
        { type: 'category-percent', categoryId: 'food', percent: 20 },
        { type: 'category-amount', categoryId: 'shopping', amountPaise: 300_000 },
        { type: 'save-more', amountPaise: 500_000 },
        { type: 'income-change', amountPaise: 1_000_000 },
      ],
    });
    // Food = groceries + delivery = 18,000; 20% = 3,600. Shopping capped at its 2,000 average.
    expect(r.adjustments.map((a) => a.monthlyImpactPaise)).toEqual([
      360_000, 200_000, 500_000, 1_000_000,
    ]);
    expect(r.adjustments[1]?.note).toContain('cannot fall below zero');
    expect(r.monthlyImpactPaise).toBe(2_060_000);
    expect(r.annualImpactPaise).toBe(24_720_000);
    expect(r.baseline.savedPaise).toBe(4_800_000);
    expect(r.newMonthlySavedPaise).toBe(6_860_000);
    expect(r.projections.map((p) => p.years)).toEqual([1, 3, 5, 10]);
    expect(r.projections[0]).toEqual({
      years: 1,
      contributedPaise: 24_720_000,
      withReturnPaise: futureValue(2_060_000, 12, 12),
    });
    expect(r.assumptions.join(' ')).toContain('12% yearly return');
    expect(r.assumptions.join(' ')).toContain('not guaranteed');
  });

  it('caps the assumed return and handles a fall in income', () => {
    const r = simulate({
      baseline,
      categories: planCategories,
      annualReturnPct: 40,
      adjustments: [{ type: 'income-change', amountPaise: -500_000 }],
    });
    expect(r.annualReturnPct).toBe(15);
    expect(r.adjustments[0]?.description).toBe('Income falls by ₹5,000 a month');
    expect(r.projections[3]).toMatchObject({
      contributedPaise: -60_000_000,
      withReturnPaise: -60_000_000,
    });
  });
});
