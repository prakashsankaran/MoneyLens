import { istDate } from '@moneylens/shared';
import type { AnalyticsTransaction, CategoryRef, RecurringSeries } from '@moneylens/types';

let counter = 0;

/** Build a transaction for tests; defaults to a ₹100 debit on 15 Sep 2026. */
export function tx(overrides: Partial<AnalyticsTransaction> = {}): AnalyticsTransaction {
  counter += 1;
  return {
    id: `tx-${counter}`,
    date: istDate(2026, 9, 15, 12),
    amountPaise: 10_000,
    type: 'DEBIT',
    flow: 'OUT',
    merchantId: null,
    merchantName: null,
    categoryId: null,
    ...overrides,
  };
}

export const categories: CategoryRef[] = [
  { id: 'food', name: 'Food', slug: 'food', parentId: null, color: null, icon: null },
  {
    id: 'delivery',
    name: 'Food Delivery',
    slug: 'food-delivery',
    parentId: 'food',
    color: null,
    icon: null,
  },
  { id: 'coffee', name: 'Coffee', slug: 'coffee', parentId: 'food', color: null, icon: null },
  { id: 'shopping', name: 'Shopping', slug: 'shopping', parentId: null, color: null, icon: null },
  {
    id: 'online',
    name: 'Online Shopping',
    slug: 'online-shopping',
    parentId: 'shopping',
    color: null,
    icon: null,
  },
  { id: 'bills', name: 'Bills', slug: 'bills', parentId: null, color: null, icon: null },
];

/** A recurring series for tests; defaults to an active monthly payment due 5 Oct 2026. */
export const series = (o: Partial<RecurringSeries> = {}): RecurringSeries => ({
  key: 'k',
  merchantId: null,
  label: 'Series',
  flow: 'OUT',
  categoryId: null,
  frequency: 'MONTHLY',
  intervalDays: 30,
  typicalAmountPaise: 0,
  amountVaries: false,
  occurrences: 6,
  firstDate: '2026-04-05',
  lastDate: '2026-09-05',
  nextExpectedDate: '2026-10-05',
  monthlyEquivalentPaise: 0,
  annualEquivalentPaise: 0,
  confidence: 0.9,
  subscriptionLike: false,
  active: true,
  transactionIds: [],
  ...o,
});
