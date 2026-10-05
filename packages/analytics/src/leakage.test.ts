import { describe, expect, it } from 'vitest';
import { istDate } from '@moneylens/shared';
import type { AnalyticsTransaction, CategoryRef, RecurringSeries } from '@moneylens/types';
import { findSavingOpportunities, isDiscretionary } from './leakage';
import { categories as baseCategories, series, tx } from './test-helpers';

const categories: CategoryRef[] = [
  ...baseCategories,
  {
    id: 'ent',
    name: 'Entertainment',
    slug: 'entertainment',
    parentId: null,
    color: null,
    icon: null,
  },
  { id: 'ott', name: 'OTT', slug: 'ott', parentId: 'ent', color: null, icon: null },
];

const on = (
  day: number,
  amountPaise: number,
  extra: Partial<AnalyticsTransaction> = {},
  month = 9,
) => tx({ amountPaise, date: istDate(2026, month, day, 12), ...extra });

const run = (txs: AnalyticsTransaction[], recurring: RecurringSeries[] = []) =>
  findSavingOpportunities({ month: '2026-09', txs, categories, recurring });

describe('isDiscretionary', () => {
  it('counts dining, delivery and shopping, but not bills or unknown categories', () => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    expect(isDiscretionary('delivery', byId)).toBe(true);
    expect(isDiscretionary('shopping', byId)).toBe(true);
    expect(isDiscretionary('food', byId)).toBe(false);
    expect(isDiscretionary('bills', byId)).toBe(false);
    expect(isDiscretionary(null, byId)).toBe(false);
  });
});

describe('findSavingOpportunities', () => {
  it('finds repeated small purchases and states the saving assumption', () => {
    const [small] = run(Array.from({ length: 12 }, (_, i) => on(i + 1, 10_000)));
    expect(small).toMatchObject({
      rule: 'leak-small-purchases',
      group: 'saving',
      severity: 'low',
      title: 'Potential saving opportunity: 12 small purchases added up to ₹1,200',
      potentialMonthlySavingPaise: 30_000,
    });
    expect(small?.assumption).toBe(
      'If one in four of these purchases were skipped, about ₹300 a month would be saved.',
    );
  });

  it('measures food delivery, discretionary spending and a merchant against their own history', () => {
    const delivery = { categoryId: 'delivery', merchantName: 'Swiggy' };
    const history = [7, 8].flatMap((m) => [
      on(4, 100_000, delivery, m),
      on(18, 100_000, delivery, m),
    ]);
    const now = [2, 6, 10, 14, 18, 22].map((d) => on(d, 100_000, delivery));
    const found = run([...history, ...now]);
    const rules = found.map((f) => f.rule);
    expect(rules).toEqual(
      expect.arrayContaining([
        'leak-food-delivery',
        'leak-rising-discretionary',
        'leak-merchant-surge',
      ]),
    );
    const food = found.find((f) => f.rule === 'leak-food-delivery');
    expect(food).toMatchObject({ severity: 'medium', potentialMonthlySavingPaise: 400_000 });
    expect(food?.assumption).toContain('2-month average');
    expect(food?.supportingTransactionIds).toEqual(now.map((t) => t.id));
  });

  it('falls back to a one-in-five estimate without history', () => {
    const now = [2, 6, 10, 14, 18, 22].map((d) => on(d, 50_000, { categoryId: 'delivery' }));
    const food = run(now).find((f) => f.rule === 'leak-food-delivery');
    expect(food?.potentialMonthlySavingPaise).toBe(60_000);
  });

  it('spots overlapping subscriptions and suggests the cheapest as the saving', () => {
    const [overlap] = run(
      [on(5, 64_900)],
      [
        series({
          label: 'Netflix',
          categoryId: 'ott',
          subscriptionLike: true,
          monthlyEquivalentPaise: 64_900,
        }),
        series({
          label: 'Hotstar',
          categoryId: 'ott',
          subscriptionLike: true,
          monthlyEquivalentPaise: 29_900,
        }),
      ],
    );
    expect(overlap).toMatchObject({
      rule: 'leak-overlapping-subscriptions',
      title: 'Potential saving opportunity: 2 OTT subscriptions',
      potentialMonthlySavingPaise: 29_900,
      metric: { valuePaise: 94_800 },
    });
  });

  it('is worded as an opportunity and ordered by the saving', () => {
    const delivery = { categoryId: 'delivery' };
    const found = run([
      ...Array.from({ length: 12 }, (_, i) => on(i + 1, 10_000)),
      ...[2, 6, 10, 14, 18, 22].map((d) => on(d, 100_000, delivery)),
    ]);
    expect(found.length).toBe(2);
    for (const f of found) {
      expect(f.title.startsWith('Potential saving opportunity: ')).toBe(true);
      expect(`${f.title} ${f.explanation}`).not.toMatch(/waste/i);
    }
    const savings = found.map((f) => f.potentialMonthlySavingPaise ?? 0);
    expect(savings).toEqual([...savings].sort((a, b) => b - a));
  });
});
