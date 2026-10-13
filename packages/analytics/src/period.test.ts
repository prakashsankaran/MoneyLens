import { describe, expect, it } from 'vitest';
import { istDate } from '@moneylens/shared';
import { periodAnalysis } from './period';
import { categories, tx } from './test-helpers';

const range = {
  from: '2026-08-01',
  to: '2026-10-31',
  previous: { from: '2026-05-01', to: '2026-07-31', compare: 'previous' as const },
  categories,
  availableMonths: [],
};

describe('periodAnalysis', () => {
  it('totals the range and compares it with the period before', () => {
    const result = periodAnalysis({
      ...range,
      txs: [
        tx({ date: istDate(2026, 6, 10), amountPaise: 100_000, categoryId: 'food' }),
        tx({ date: istDate(2026, 8, 10), amountPaise: 60_000, categoryId: 'food' }),
        tx({ date: istDate(2026, 10, 31, 23, 30), amountPaise: 90_000, categoryId: 'bills' }),
        tx({ date: istDate(2026, 9, 1), type: 'CREDIT', flow: 'IN', amountPaise: 500_000 }),
        // Outside both periods.
        tx({ date: istDate(2026, 11, 1), amountPaise: 999_999 }),
      ],
    });
    expect(result.days).toBe(92);
    expect(result.wholeMonths).toBe(true);
    expect(result.months).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(result.monthsWithData).toBe(3);
    expect(result.totals.spendingPaise).toBe(150_000);
    expect(result.previousTotals?.spendingPaise).toBe(100_000);
    expect(result.spendingChangePct).toBe(50);
    expect(result.averages.monthlySpendingPaise).toBe(50_000);
    expect(result.averages.monthlyIncomePaise).toBe(166_667);
    expect(result.highestMonth?.month).toBe('2026-10');
    expect(result.lowestMonth?.month).toBe('2026-09');
    expect(result.previous).toMatchObject({ months: 3, monthsWithData: 1 });
    expect(result.categoryChanges.map((c) => [c.name, c.changePaise])).toEqual([
      ['Bills', 90_000],
      ['Food', -40_000],
    ]);
  });

  it('averages only over months that have data', () => {
    const result = periodAnalysis({
      ...range,
      from: '2025-11-01',
      to: '2026-10-31',
      previous: { from: '2024-11-01', to: '2025-10-31', compare: 'previous' },
      txs: [
        tx({ date: istDate(2026, 9, 10), amountPaise: 30_000 }),
        tx({ date: istDate(2026, 10, 10), amountPaise: 50_000 }),
      ],
    });
    expect(result.months).toHaveLength(12);
    expect(result.monthsWithData).toBe(2);
    expect(result.averages.monthlySpendingPaise).toBe(40_000);
    expect(result.averages.dailySpendingPaise).toBe(Math.round(80_000 / 61));
    expect(result.previous.hasData).toBe(false);
    expect(result.spendingChangePct).toBeNull();
    expect(result.categoryChanges).toEqual([]);
  });

  it('counts a partly covered month as a fraction when averaging', () => {
    const result = periodAnalysis({
      ...range,
      from: '2026-09-16',
      to: '2026-10-31',
      previous: { from: '2026-08-01', to: '2026-09-15', compare: 'previous' },
      txs: [
        tx({ date: istDate(2026, 9, 20), amountPaise: 45_000 }),
        tx({ date: istDate(2026, 10, 20), amountPaise: 45_000 }),
      ],
    });
    // 15/30 of September plus all of October = 1.5 months.
    expect(result.averages.monthlySpendingPaise).toBe(60_000);
  });

  it('keeps the top five categories by month and sums the rest', () => {
    const many = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
      { id: 'd', name: 'D' },
      { id: 'e', name: 'E' },
      { id: 'f', name: 'F' },
      { id: 'g', name: 'G' },
    ].map((c) => ({ ...c, slug: c.id, parentId: null, color: null, icon: null }));
    const result = periodAnalysis({
      ...range,
      categories: many,
      txs: many.map((c, i) =>
        tx({ date: istDate(2026, 9, 5), categoryId: c.id, amountPaise: (10 - i) * 1000 }),
      ),
    });
    expect(result.categoryTrend.series.map((s) => s.name)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'Everything else',
    ]);
    const september = result.categoryTrend.points.find((p) => p.month === '2026-09');
    expect(september?.values.other).toBe(4000 + 5000);
    expect(september?.values.a).toBe(10_000);
  });

  it('breaks each category into its subcategories', () => {
    const result = periodAnalysis({
      ...range,
      txs: [
        tx({ date: istDate(2026, 9, 5), categoryId: 'delivery', amountPaise: 30_000 }),
        tx({ date: istDate(2026, 9, 6), categoryId: 'coffee', amountPaise: 10_000 }),
        tx({ date: istDate(2026, 9, 7), categoryId: 'online', amountPaise: 5_000 }),
      ],
    });
    expect(result.categories.map((c) => c.name)).toEqual(['Food', 'Shopping']);
    expect(result.subcategories.food?.map((c) => [c.name, c.amountPaise])).toEqual([
      ['Food Delivery', 30_000],
      ['Coffee', 10_000],
    ]);
  });

  it('spreads weekday averages over every day of the range', () => {
    const result = periodAnalysis({
      ...range,
      from: '2026-09-07',
      to: '2026-09-20',
      previous: { from: '2026-08-24', to: '2026-09-06', compare: 'previous' },
      // 12 Sep 2026 is a Saturday.
      txs: [tx({ date: istDate(2026, 9, 12), amountPaise: 40_000 })],
    });
    expect(result.patterns.byWeekday[5]?.amountPaise).toBe(40_000);
    expect(result.patterns.weekendDailyAveragePaise).toBe(10_000);
    expect(result.patterns.weekdayDailyAveragePaise).toBe(0);
    expect(result.patterns.weekendRatio).toBeNull();
  });
});
