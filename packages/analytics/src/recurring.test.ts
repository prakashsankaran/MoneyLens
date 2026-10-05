import { describe, expect, it } from 'vitest';
import { istDate } from '@moneylens/shared';
import type { CategoryRef } from '@moneylens/types';
import { detectRecurring } from './recurring';
import { tx } from './test-helpers';

const asOf = istDate(2026, 9, 30, 20);
const cats: CategoryRef[] = [
  {
    id: 'ent',
    name: 'Entertainment',
    slug: 'entertainment',
    parentId: null,
    color: null,
    icon: null,
  },
  { id: 'ott', name: 'OTT', slug: 'ott', parentId: 'ent', color: null, icon: null },
  { id: 'housing', name: 'Housing', slug: 'housing', parentId: null, color: null, icon: null },
  { id: 'rent', name: 'Rent', slug: 'rent', parentId: 'housing', color: null, icon: null },
];

const monthly = (name: string, amounts: number[], day = 5, extra = {}) =>
  amounts.map((amountPaise, i) =>
    tx({
      merchantId: name,
      merchantName: name,
      amountPaise,
      date: istDate(2026, 4 + i, day, 10),
      ...extra,
    }),
  );

describe('detectRecurring', () => {
  it('finds a monthly subscription with its schedule and cost', () => {
    const [netflix] = detectRecurring(
      monthly('Netflix', [64_900, 64_900, 64_900, 64_900, 64_900, 64_900], 5, {
        categoryId: 'ott',
      }),
      {
        asOf,
        categories: cats,
      },
    );
    expect(netflix).toMatchObject({
      label: 'Netflix',
      frequency: 'MONTHLY',
      typicalAmountPaise: 64_900,
      occurrences: 6,
      lastDate: '2026-09-05',
      nextExpectedDate: '2026-10-05',
      monthlyEquivalentPaise: 64_900,
      annualEquivalentPaise: 64_900 * 12,
      subscriptionLike: true,
      active: true,
      amountVaries: false,
    });
    expect(netflix!.confidence).toBe(1);
  });

  it('does not call rent a subscription, and allows varying bills', () => {
    const series = detectRecurring(
      [
        ...monthly('Landlord', [3_200_000, 3_200_000, 3_200_000, 3_200_000], 3, {
          categoryId: 'rent',
        }),
        ...monthly('BESCOM', [150_000, 210_000, 260_000, 180_000, 160_000]),
      ],
      { asOf, categories: cats },
    );
    const rent = series.find((s) => s.label === 'Landlord');
    const power = series.find((s) => s.label === 'BESCOM');
    expect(rent?.subscriptionLike).toBe(false);
    expect(power).toMatchObject({ amountVaries: true, subscriptionLike: false });
  });

  it('ignores irregular spending and too few occurrences', () => {
    const irregular = [1, 3, 9, 10, 22, 40, 41, 70].map((d) =>
      tx({
        merchantName: 'Swiggy',
        date: new Date(istDate(2026, 6, 1).getTime() + d * 86_400_000),
      }),
    );
    expect(detectRecurring([...irregular, ...monthly('Gym', [99_900, 99_900])], { asOf })).toEqual(
      [],
    );
  });

  it('finds the regular payment inside a merchant with other purchases', () => {
    const prime = monthly('Amazon', [29_900, 29_900, 29_900, 29_900], 12);
    const shopping = [4, 9, 17, 25].map((d, i) =>
      tx({
        merchantName: 'Amazon',
        merchantId: 'Amazon',
        amountPaise: 150_000 + i * 70_000,
        date: istDate(2026, 5, d, 10),
      }),
    );
    const [series] = detectRecurring([...prime, ...shopping], { asOf });
    expect(series).toMatchObject({
      typicalAmountPaise: 29_900,
      occurrences: 4,
      frequency: 'MONTHLY',
    });
    expect(series!.transactionIds).toEqual(prime.map((t) => t.id));
  });

  it('detects weekly, yearly and recurring income, and marks stopped series', () => {
    const weekly = [0, 7, 14, 21, 28].map((d) =>
      tx({
        merchantName: 'Maid',
        type: 'TRANSFER',
        amountPaise: 50_000,
        date: new Date(istDate(2026, 9, 1, 9).getTime() + d * 86_400_000),
      }),
    );
    const yearly = [2024, 2025, 2026].map((y) =>
      tx({ merchantName: 'Domain', amountPaise: 99_900, date: istDate(y, 3, 10, 9) }),
    );
    const salary = monthly('Employer', [14_500_000, 14_500_000, 14_500_000], 1, {
      type: 'CREDIT',
      flow: 'IN',
    });
    const result = detectRecurring([...weekly, ...yearly, ...salary], { asOf });
    expect(result.find((r) => r.label === 'Maid')).toMatchObject({
      frequency: 'WEEKLY',
      monthlyEquivalentPaise: Math.round((50_000 * 52) / 12),
    });
    expect(result.find((r) => r.label === 'Domain')).toMatchObject({
      frequency: 'YEARLY',
      active: true,
    });
    // Salary ran May–July only: by the end of September it has stopped.
    expect(result.find((r) => r.label === 'Employer')).toMatchObject({ flow: 'IN', active: false });
  });

  it('ignores self transfers and same-day repeats', () => {
    const self = monthly('Own account', [1_000_000, 1_000_000, 1_000_000], 2, {
      type: 'SELF_TRANSFER',
    });
    const sameDay = [1, 1, 1].map(() => tx({ merchantName: 'Chai', date: istDate(2026, 9, 1, 9) }));
    expect(detectRecurring([...self, ...sameDay], { asOf })).toEqual([]);
  });
});
