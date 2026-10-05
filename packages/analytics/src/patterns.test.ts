import { describe, expect, it } from 'vitest';
import { istDate } from '@moneylens/shared';
import { categoryComparisons, periodComparisons, spendingPatterns } from './patterns';
import { categories, tx } from './test-helpers';

/** One debit of `amount` on the 10th of each given month (2026). */
const spendIn = (months: number[], amountPaise: number, extra = {}) =>
  months.map((m) => tx({ amountPaise, date: istDate(2026, m, 10, 12), ...extra }));

describe('periodComparisons', () => {
  it('compares with the previous month and the 3- and 6-month averages', () => {
    const txs = [
      ...spendIn([3, 4, 5], 100_000),
      ...spendIn([6, 7, 8], 200_000),
      ...spendIn([9], 300_000),
    ];
    const rows = periodComparisons(txs, '2026-09');
    const by = Object.fromEntries(rows.map((r) => [r.baseline, r]));
    expect(by['previous-month']).toMatchObject({
      currentPaise: 300_000,
      baselinePaise: 200_000,
      changePaise: 100_000,
      changePct: 50,
      baselineMonths: 1,
    });
    expect(by['avg-3']).toMatchObject({ baselinePaise: 200_000, baselineMonths: 3 });
    expect(by['avg-6']).toMatchObject({
      baselinePaise: 150_000,
      baselineMonths: 6,
      changePct: 100,
    });
  });

  it('compares the quarter so far with the same months of the previous quarter', () => {
    // Q3 so far is Jul–Sep; previous quarter Apr–Jun.
    const txs = [...spendIn([4, 5, 6], 100_000), ...spendIn([7, 8, 9], 150_000)];
    const quarter = periodComparisons(txs, '2026-09').find((r) => r.baseline === 'quarter');
    expect(quarter).toMatchObject({
      label: 'Q3 so far vs previous quarter',
      currentPaise: 450_000,
      baselinePaise: 300_000,
      changePct: 50,
    });
  });

  it('only averages months that have data, and gives no percentage without a baseline', () => {
    const txs = [...spendIn([7], 100_000), ...spendIn([9], 100_000)];
    const rows = periodComparisons(txs, '2026-09');
    expect(rows.find((r) => r.baseline === 'avg-3')).toMatchObject({
      baselinePaise: 100_000,
      baselineMonths: 1,
    });
    const prev = rows.find((r) => r.baseline === 'previous-month');
    expect(prev).toMatchObject({ baselinePaise: 0, baselineMonths: 0, changePct: null });
    expect(rows.find((r) => r.baseline === 'ytd')?.changePct).toBeNull();
  });
});

describe('categoryComparisons', () => {
  it('lines up categories across months, including ones missing this month', () => {
    const txs = [
      ...spendIn([8], 100_000, { categoryId: 'delivery' }),
      ...spendIn([8], 50_000, { categoryId: 'online' }),
      ...spendIn([9], 150_000, { categoryId: 'delivery' }),
    ];
    const rows = categoryComparisons(txs, '2026-09', categories);
    expect(rows[0]).toMatchObject({
      categoryId: 'food',
      currentPaise: 150_000,
      previousPaise: 100_000,
      changeVsPreviousPct: 50,
      currentCount: 1,
    });
    expect(rows[1]).toMatchObject({
      categoryId: 'shopping',
      currentPaise: 0,
      previousPaise: 50_000,
      changeVsPreviousPct: -100,
    });
  });
});

describe('spendingPatterns', () => {
  it('splits weekday and weekend spending per calendar day', () => {
    // September 2026 has 22 weekdays and 8 weekend days. Sat 5, Mon 7.
    const txs = [
      tx({ amountPaise: 220_000, date: istDate(2026, 9, 7, 12) }),
      tx({ amountPaise: 160_000, date: istDate(2026, 9, 5, 12) }),
    ];
    const p = spendingPatterns(txs, '2026-09');
    expect(p.weekdayDailyAveragePaise).toBe(10_000);
    expect(p.weekendDailyAveragePaise).toBe(20_000);
    expect(p.weekendRatio).toBe(2);
    expect(p.byWeekday[0]).toMatchObject({ label: 'Monday', amountPaise: 220_000 });
    expect(p.byWeekday[5]).toMatchObject({ label: 'Saturday', amountPaise: 160_000 });
    // Weeks start on Monday; the first one starts on 31 August.
    expect(p.weekly[0]?.weekStart).toBe('2026-08-31');
    expect(p.weekly[0]?.amountPaise).toBe(160_000);
    expect(p.weekly[1]).toMatchObject({ weekStart: '2026-09-07', amountPaise: 220_000 });
  });

  it('reports volatility only with 3 months, and tallies refunds, cashback and transfers', () => {
    const base = [...spendIn([7], 100_000), ...spendIn([8], 300_000)];
    expect(spendingPatterns([...base, ...spendIn([9], 200_000)], '2026-09')).toMatchObject({
      volatilityMonths: 3,
      monthlyVolatility: 0.41,
    });
    expect(spendingPatterns(base, '2026-08').monthlyVolatility).toBeNull();

    const p = spendingPatterns(
      [
        ...spendIn([9], 500_000),
        tx({ type: 'REFUND', flow: 'IN', amountPaise: 20_000 }),
        tx({ type: 'CASHBACK', flow: 'IN', amountPaise: 5_000 }),
        tx({ type: 'TRANSFER', flow: 'OUT', amountPaise: 70_000 }),
      ],
      '2026-09',
    );
    expect(p.refunds).toEqual({ count: 1, amountPaise: 20_000 });
    expect(p.cashback).toEqual({ count: 1, amountPaise: 5_000 });
    expect(p.transfersOut).toEqual({ count: 1, amountPaise: 70_000 });
    expect(p.largest[0]?.amountPaise).toBe(500_000);
  });
});
