import { describe, expect, it } from 'vitest';
import { istDate } from '@moneylens/shared';
import type { AnalyticsTransaction } from '@moneylens/types';
import { monthlyReport } from './report';
import { categories, tx } from './test-helpers';

const on = (
  day: number,
  amountPaise: number,
  extra: Partial<AnalyticsTransaction> = {},
  month = 9,
) => tx({ amountPaise, date: istDate(2026, month, day, 12), ...extra });

const salary = (month: number) =>
  on(
    1,
    10_000_000,
    { type: 'CREDIT', flow: 'IN', merchantName: 'Employer', merchantId: 'emp' },
    month,
  );

const txs = [
  salary(8),
  on(5, 1_000_000, { merchantName: 'Swiggy', merchantId: 'swiggy', categoryId: 'delivery' }, 8),
  on(9, 500_000, { merchantName: 'Amazon', merchantId: 'amazon', categoryId: 'online' }, 8),
  salary(9),
  on(5, 2_500_000, { merchantName: 'Swiggy', merchantId: 'swiggy', categoryId: 'delivery' }),
  on(9, 400_000, { merchantName: 'Amazon', merchantId: 'amazon', categoryId: 'online' }),
  on(12, 100_000, { merchantName: 'Tata Power', merchantId: 'power', categoryId: 'bills' }),
];

describe('monthlyReport', () => {
  const report = monthlyReport({
    month: '2026-09',
    txs,
    categories,
    recurring: [],
    availableMonths: ['2026-08', '2026-09'],
  });

  it('opens with labelled summary statements built from calculated figures', () => {
    expect(report.executiveSummary).toEqual([
      { kind: 'CALCULATION', text: 'In September 2026 you received ₹1,00,000 and spent ₹30,000.' },
      { kind: 'CALCULATION', text: 'You kept ₹70,000, 70% of your income.' },
      {
        kind: 'CALCULATION',
        text: 'Compared with August 2026, spending was ₹30,000 against ₹15,000 (up 100%).',
      },
      { kind: 'CALCULATION', text: 'Food was your largest category at ₹25,000.' },
      { kind: 'OBSERVATION', text: 'Food rose the most, by ₹15,000 from August 2026.' },
    ]);
  });

  it('fills every section from the month and its comparison month', () => {
    expect(report.compareMonth).toBe('2026-08');
    expect(report.totals.spendingPaise).toBe(3_000_000);
    expect(report.compareTotals?.spendingPaise).toBe(1_500_000);
    expect(report.incomeSources).toEqual([
      expect.objectContaining({ name: 'Employer', amountPaise: 10_000_000 }),
    ]);
    expect(report.merchants.map((m) => [m.name, m.amountPaise, m.previousAmountPaise])).toEqual([
      ['Swiggy', 2_500_000, 1_000_000],
      ['Amazon', 400_000, 500_000],
      ['Tata Power', 100_000, 0],
    ]);
    expect(report.biggestTransactions[0]?.amountPaise).toBe(2_500_000);
    expect(report.categories[0]).toMatchObject({ categoryId: 'food', previousPaise: 1_000_000 });
    expect(report.health.month).toBe('2026-09');
    expect(report.recommendations.length).toBeLessThanOrEqual(5);
    for (const r of report.recommendations) expect(r.kind).toBe('RECOMMENDATION');
  });

  it('has no comparison when the comparison month is empty', () => {
    const lone = monthlyReport({
      month: '2026-09',
      compareMonth: '2026-03',
      txs,
      categories,
      recurring: [],
      availableMonths: ['2026-08', '2026-09'],
    });
    expect(lone.compareMonth).toBeNull();
    expect(lone.compareTotals).toBeNull();
    expect(lone.executiveSummary.some((s) => s.text.startsWith('Compared with'))).toBe(false);
  });
});
