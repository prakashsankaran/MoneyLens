import { describe, expect, it } from 'vitest';
import { categoriesAboveAverage, smallTransactionAccumulation } from './observations';
import { categories, tx } from './test-helpers';

const month = (deliveryPaise: number, coffeePaise = 0) => [
  tx({ categoryId: 'delivery', amountPaise: deliveryPaise }),
  ...(coffeePaise ? [tx({ categoryId: 'coffee', amountPaise: coffeePaise })] : []),
];

describe('categoriesAboveAverage', () => {
  it('reports the subcategory that rose, with the average it was compared to', () => {
    const current = month(1_000_000);
    const obs = categoriesAboveAverage(
      current,
      [month(600_000), month(700_000), month(800_000)],
      categories,
    );
    expect(obs).toHaveLength(1);
    const [o] = obs;
    expect(o?.kind).toBe('OBSERVATION');
    expect(o?.title).toBe('Food Delivery is ₹3,000 above your 3-month average');
    expect(o?.metric.valuePaise).toBe(300_000);
    expect(o?.explanation).toContain('₹7,000');
    expect(o?.supportingTransactionIds).toEqual(current.map((t) => t.id));
  });

  it('does not repeat the parent when a subcategory explains the rise', () => {
    const obs = categoriesAboveAverage(
      month(1_000_000, 10_000),
      [month(600_000, 10_000), month(600_000, 10_000)],
      categories,
    );
    expect(obs.map((o) => o.id)).toEqual(['category-above-average:food-delivery']);
  });

  it('needs enough history before comparing', () => {
    expect(categoriesAboveAverage(month(1_000_000), [month(100_000)], categories)).toEqual([]);
    expect(categoriesAboveAverage(month(1_000_000), [[], [], month(100_000)], categories)).toEqual(
      [],
    );
  });

  it('ignores categories with no spending history', () => {
    const history = [month(100_000), month(100_000)];
    const current = [...month(100_000), tx({ categoryId: 'online', amountPaise: 900_000 })];
    expect(categoriesAboveAverage(current, history, categories)).toEqual([]);
  });

  it('ignores small or proportionally minor increases', () => {
    // +₹500: below the ₹1,000 floor.
    expect(
      categoriesAboveAverage(month(150_000), [month(100_000), month(100_000)], categories),
    ).toEqual([]);
    // +₹1,500 on a ₹20,000 base is only 7.5%.
    expect(
      categoriesAboveAverage(month(2_150_000), [month(2_000_000), month(2_000_000)], categories),
    ).toEqual([]);
  });
});

describe('smallTransactionAccumulation', () => {
  it('reports frequent small payments with their total', () => {
    const small = Array.from({ length: 12 }, () => tx({ amountPaise: 25_000 }));
    const obs = smallTransactionAccumulation([...small, tx({ amountPaise: 500_000 })]);
    expect(obs).toHaveLength(1);
    expect(obs[0]?.title).toBe('12 small transactions added up to ₹3,000');
    expect(obs[0]?.supportingTransactionIds).toEqual(small.map((t) => t.id));
  });

  it('stays quiet below the minimum count', () => {
    const small = Array.from({ length: 7 }, () => tx({ amountPaise: 25_000 }));
    expect(smallTransactionAccumulation(small)).toEqual([]);
  });

  it('treats the threshold as exclusive and ignores non-spend', () => {
    const atThreshold = Array.from({ length: 10 }, () => tx({ amountPaise: 30_000 }));
    const cashback = Array.from({ length: 10 }, () =>
      tx({ type: 'CASHBACK', flow: 'IN', amountPaise: 1_000 }),
    );
    expect(smallTransactionAccumulation([...atThreshold, ...cashback])).toEqual([]);
  });
});
