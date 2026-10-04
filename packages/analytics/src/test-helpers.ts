import { istDate } from '@moneylens/shared';
import type { AnalyticsTransaction, CategoryRef } from '@moneylens/types';

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
