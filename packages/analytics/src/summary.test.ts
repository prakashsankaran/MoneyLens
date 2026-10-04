import { describe, expect, it } from 'vitest';
import { istDate } from '@moneylens/shared';
import {
  categoryBreakdown,
  comparePeriods,
  monthlyTrend,
  summarizePeriod,
  topMerchants,
} from './summary';
import { categories, tx } from './test-helpers';

describe('summarizePeriod', () => {
  it('returns zeros and a null savings rate for no data', () => {
    const totals = summarizePeriod([]);
    expect(totals.incomePaise).toBe(0);
    expect(totals.spendingPaise).toBe(0);
    expect(totals.savingsRatePct).toBeNull();
    expect(totals.medianSpendPaise).toBe(0);
  });

  it('nets refunds, excludes self transfers, and separates cashback', () => {
    const totals = summarizePeriod([
      tx({ type: 'CREDIT', flow: 'IN', amountPaise: 10_000_000 }),
      tx({ amountPaise: 2_000_000 }),
      tx({ type: 'TRANSFER', flow: 'OUT', amountPaise: 1_000_000 }),
      tx({ type: 'REFUND', flow: 'IN', amountPaise: 500_000 }),
      tx({ type: 'CASHBACK', flow: 'IN', amountPaise: 5_000 }),
      tx({ type: 'SELF_TRANSFER', flow: 'OUT', amountPaise: 4_000_000 }),
    ]);
    expect(totals.incomePaise).toBe(10_000_000);
    expect(totals.grossSpendingPaise).toBe(3_000_000);
    expect(totals.refundsPaise).toBe(500_000);
    expect(totals.spendingPaise).toBe(2_500_000);
    expect(totals.cashbackPaise).toBe(5_000);
    expect(totals.savedPaise).toBe(7_500_000);
    expect(totals.savingsRatePct).toBe(75);
    expect(totals.spendTransactionCount).toBe(2);
    expect(totals.averageSpendPaise).toBe(1_500_000);
    expect(totals.medianSpendPaise).toBe(1_500_000);
  });

  it('allows negative savings when spending exceeds income', () => {
    const totals = summarizePeriod([
      tx({ type: 'CREDIT', flow: 'IN', amountPaise: 100_000 }),
      tx({ amountPaise: 150_000 }),
    ]);
    expect(totals.savedPaise).toBe(-50_000);
    expect(totals.savingsRatePct).toBe(-50);
  });

  it('keeps exact integer totals for many small amounts', () => {
    const many = Array.from({ length: 1000 }, () => tx({ amountPaise: 1 }));
    expect(summarizePeriod(many).spendingPaise).toBe(1000);
  });
});

describe('categoryBreakdown', () => {
  it('rolls subcategories up to their parent and sorts by amount', () => {
    const rows = categoryBreakdown(
      [
        tx({ categoryId: 'delivery', amountPaise: 30_000 }),
        tx({ categoryId: 'coffee', amountPaise: 10_000 }),
        tx({ categoryId: 'online', amountPaise: 60_000 }),
      ],
      categories,
    );
    expect(rows.map((r) => [r.slug, r.amountPaise, r.transactionCount])).toEqual([
      ['shopping', 60_000, 1],
      ['food', 40_000, 2],
    ]);
    expect(rows.map((r) => r.sharePct)).toEqual([60, 40]);
  });

  it('keeps leaf categories separate at leaf level', () => {
    const rows = categoryBreakdown(
      [
        tx({ categoryId: 'delivery', amountPaise: 30_000 }),
        tx({ categoryId: 'coffee', amountPaise: 10_000 }),
      ],
      categories,
      'leaf',
    );
    expect(rows.map((r) => r.slug)).toEqual(['food-delivery', 'coffee']);
  });

  it('subtracts refunds within a category and drops categories netting to zero', () => {
    const rows = categoryBreakdown(
      [
        tx({ categoryId: 'online', amountPaise: 50_000 }),
        tx({ categoryId: 'online', type: 'REFUND', flow: 'IN', amountPaise: 50_000 }),
        tx({ categoryId: 'delivery', amountPaise: 20_000 }),
      ],
      categories,
    );
    expect(rows.map((r) => r.slug)).toEqual(['food']);
  });

  it('groups missing or unknown categories as Uncategorized', () => {
    const rows = categoryBreakdown(
      [tx({ categoryId: null }), tx({ categoryId: 'does-not-exist' })],
      categories,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ slug: 'uncategorized', categoryId: null, sharePct: 100 });
  });

  it('ignores income and self transfers', () => {
    expect(
      categoryBreakdown(
        [
          tx({ type: 'CREDIT', flow: 'IN', categoryId: 'bills' }),
          tx({ type: 'SELF_TRANSFER', categoryId: 'bills' }),
        ],
        categories,
      ),
    ).toEqual([]);
  });
});

describe('monthlyTrend', () => {
  it('returns every requested month, including empty ones, in order', () => {
    const trend = monthlyTrend(
      [
        tx({ date: istDate(2026, 7, 10), amountPaise: 1_000 }),
        tx({ date: istDate(2026, 9, 10), amountPaise: 3_000 }),
        tx({ date: istDate(2026, 9, 1), type: 'CREDIT', flow: 'IN', amountPaise: 10_000 }),
      ],
      ['2026-07', '2026-08', '2026-09'],
    );
    expect(trend).toEqual([
      { month: '2026-07', incomePaise: 0, spendingPaise: 1_000, savedPaise: -1_000 },
      { month: '2026-08', incomePaise: 0, spendingPaise: 0, savedPaise: 0 },
      { month: '2026-09', incomePaise: 10_000, spendingPaise: 3_000, savedPaise: 7_000 },
    ]);
  });

  it('buckets by IST month boundaries', () => {
    // 30 Sep 23:30 IST belongs to September even though it is still 30 Sep UTC.
    const trend = monthlyTrend(
      [tx({ date: istDate(2026, 9, 30, 23, 30) }), tx({ date: istDate(2026, 10, 1, 0, 15) })],
      ['2026-09', '2026-10'],
    );
    expect(trend.map((t) => t.spendingPaise)).toEqual([10_000, 10_000]);
  });
});

describe('topMerchants', () => {
  it('ranks merchants by spend and counts transactions', () => {
    const rows = topMerchants(
      [
        tx({ merchantId: 'm1', merchantName: 'Swiggy', amountPaise: 30_000 }),
        tx({ merchantId: 'm1', merchantName: 'Swiggy', amountPaise: 20_000 }),
        tx({ merchantId: 'm2', merchantName: 'Amazon', amountPaise: 40_000 }),
        tx({ merchantId: null, merchantName: null, amountPaise: 99_000 }),
        tx({ merchantId: 'm3', merchantName: 'Salary', type: 'CREDIT', flow: 'IN' }),
      ],
      2,
    );
    expect(rows).toEqual([
      { merchantId: 'm1', name: 'Swiggy', amountPaise: 50_000, transactionCount: 2 },
      { merchantId: 'm2', name: 'Amazon', amountPaise: 40_000, transactionCount: 1 },
    ]);
  });
});

describe('comparePeriods', () => {
  it('computes percentage changes and the change in savings', () => {
    expect(
      comparePeriods(
        { month: '2026-09', incomePaise: 100_000, spendingPaise: 60_000, savedPaise: 40_000 },
        { month: '2026-08', incomePaise: 100_000, spendingPaise: 50_000, savedPaise: 50_000 },
      ),
    ).toEqual({
      previousMonth: '2026-08',
      incomeChangePct: 0,
      spendingChangePct: 20,
      savedChangePaise: -10_000,
    });
  });

  it('returns null percentages when the previous value is zero', () => {
    const c = comparePeriods(
      { month: '2026-09', incomePaise: 100, spendingPaise: 100, savedPaise: 0 },
      { month: '2026-08', incomePaise: 0, spendingPaise: 0, savedPaise: 0 },
    );
    expect(c.incomeChangePct).toBeNull();
    expect(c.spendingChangePct).toBeNull();
  });
});
