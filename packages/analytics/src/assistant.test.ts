import { describe, expect, it } from 'vitest';
import { istDate } from '@moneylens/shared';
import { assistantContext, spendingDriver } from './assistant';
import { categories, tx } from './test-helpers';

const NOW = istDate(2026, 10, 5, 12);
const delivery = (month: number, day: number, amountPaise: number) =>
  tx({
    amountPaise,
    date: istDate(2026, month, day, 20),
    categoryId: 'delivery',
    merchantId: 'swiggy',
    merchantName: 'Swiggy',
  });

describe('spendingDriver', () => {
  it('names the measure that moved', () => {
    expect(spendingDriver(100, 0)).toBe('frequency');
    expect(spendingDriver(5, 40)).toBe('size');
    expect(spendingDriver(30, 25)).toBe('both');
    expect(spendingDriver(5, -5)).toBe('neither');
    expect(spendingDriver(null, 10)).toBeNull();
  });
});

describe('assistantContext', () => {
  // August: 2 orders of ₹400. September: 6 orders of ₹400 (frequency tripled).
  const txs = [
    ...[3, 10].map((d) => delivery(8, d, 40_000)),
    ...[2, 5, 9, 14, 20, 26].map((d) => delivery(9, d, 40_000)),
    tx({ type: 'CREDIT', flow: 'IN', amountPaise: 10_000_000, date: istDate(2026, 9, 1, 9) }),
  ];
  const ctx = assistantContext({
    month: '2026-09',
    availableMonths: ['2026-08', '2026-09'],
    txs,
    categories,
    recurring: [],
    now: NOW,
  });

  it('works out category changes and what drove them', () => {
    const food = ctx.categoryChanges.find((c) => c.categoryId === 'food');
    expect(food).toMatchObject({
      currentPaise: 240_000,
      previousPaise: 80_000,
      changePaise: 160_000,
      changeVsPreviousPct: 200,
      currentCount: 6,
      previousCount: 2,
      currentAveragePaise: 40_000,
      previousAveragePaise: 40_000,
      countChangePct: 200,
      averageChangePct: 0,
      driver: 'frequency',
    });
    // The subcategory is listed too, so "food delivery" questions can be answered.
    expect(ctx.categoryChanges.some((c) => c.categoryId === 'delivery')).toBe(true);
  });

  it('gives totals, changes and top merchants ready-made', () => {
    expect(ctx.totals.spendingPaise).toBe(240_000);
    expect(ctx.spendingChangePaise).toBe(160_000);
    expect(ctx.spendingChangePct).toBe(200);
    expect(ctx.topMerchants[0]).toMatchObject({ name: 'Swiggy', transactionCount: 6 });
    expect(ctx.monthInProgress).toBe(false);
  });

  it('states what the data cannot support', () => {
    expect(ctx.dataLimitations).toEqual([
      'There is only 1 earlier month of data, so averages and trends are less reliable.',
    ]);
    const single = assistantContext({
      month: '2026-10',
      availableMonths: ['2026-10'],
      txs: [delivery(10, 2, 10_000)],
      categories,
      recurring: [],
      now: NOW,
    });
    expect(single.dataLimitations).toEqual([
      'I only have transaction data for October 2026, so I cannot compare it with earlier months or judge a long-term trend.',
      'October 2026 is still in progress, so its totals are not final.',
    ]);
  });

  it('keeps a running total of saving opportunities, largest first', () => {
    let running = 0;
    for (const o of ctx.savingOpportunities) {
      running += o.potentialMonthlySavingPaise;
      expect(o.cumulativeMonthlySavingPaise).toBe(running);
    }
    expect(ctx.savingOpportunitiesTotalPaise).toBe(running);
  });
});
