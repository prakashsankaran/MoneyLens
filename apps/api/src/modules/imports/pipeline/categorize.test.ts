import { describe, expect, it } from 'vitest';
import { istDate } from '@moneylens/shared';
import { categorize, type CategorizationContext } from './categorize';
import type { ParsedRow } from './types';

const row = (description: string, overrides: Partial<ParsedRow> = {}): ParsedRow => ({
  rowIndex: 2,
  date: istDate(2026, 9, 5, 12),
  amountPaise: 45_000,
  flow: 'OUT',
  type: 'DEBIT',
  description,
  upiId: null,
  reference: null,
  warnings: [],
  ...overrides,
});

const ctx = (overrides: Partial<CategorizationContext> = {}): CategorizationContext => ({
  rules: [],
  merchantsByKey: new Map(),
  categoryIdByPath: new Map([
    ['food/food-delivery', 'cat-delivery'],
    ['food/restaurants', 'cat-restaurants'],
    ['food/coffee', 'cat-coffee'],
    ['income/salary', 'cat-salary'],
    ['transfers/self-transfer', 'cat-self'],
    ['housing/rent', 'cat-rent'],
  ]),
  ...overrides,
});

describe('categorize', () => {
  it('recognises well-known merchants', () => {
    expect(categorize(row('UPI-SWIGGY-swiggy@icici-424698765432'), ctx())).toMatchObject({
      merchantName: 'Swiggy',
      merchantKey: 'SWIGGY',
      categoryId: 'cat-delivery',
      confidence: 0.85,
      source: 'known-merchant',
    });
  });

  it("prefers the user's own merchant mapping", () => {
    const result = categorize(
      row('SWIGGY*FOOD'),
      ctx({
        merchantsByKey: new Map([
          ['SWIGGY', { id: 'm1', name: 'Swiggy', categoryId: 'cat-restaurants' }],
        ]),
      }),
    );
    expect(result).toMatchObject({
      merchantId: 'm1',
      categoryId: 'cat-restaurants',
      source: 'merchant',
    });
  });

  it('applies user rules before anything else', () => {
    const result = categorize(
      row('UPI-SWIGGY-swiggy@icici'),
      ctx({
        rules: [
          { matchField: 'MERCHANT', pattern: 'SWIGGY', categoryId: 'cat-coffee', priority: 0 },
        ],
      }),
    );
    expect(result).toMatchObject({ categoryId: 'cat-coffee', confidence: 1, source: 'rule' });
  });

  it('matches description and UPI rules', () => {
    const rules = [
      {
        matchField: 'DESCRIPTION' as const,
        pattern: 'school fees',
        categoryId: 'cat-x',
        priority: 0,
      },
      { matchField: 'UPI_ID' as const, pattern: 'amma@oksbi', categoryId: 'cat-y', priority: 0 },
    ];
    expect(categorize(row('NEFT DR SCHOOL FEES TERM 2'), ctx({ rules })).categoryId).toBe('cat-x');
    expect(categorize(row('UPI-AMMA', { upiId: 'amma@oksbi' }), ctx({ rules })).categoryId).toBe(
      'cat-y',
    );
  });

  it('falls back to keywords, respecting direction', () => {
    expect(
      categorize(row('NEFT CR SALARY SEP', { flow: 'IN', type: 'CREDIT' }), ctx()),
    ).toMatchObject({
      categoryId: 'cat-salary',
      source: 'keyword',
      confidence: 0.6,
    });
    // "Salary" on an outgoing payment is not income.
    expect(categorize(row('SALARY ADVANCE REPAYMENT'), ctx()).categoryId).toBeNull();
  });

  it('categorises self transfers by type', () => {
    expect(categorize(row('Self transfer', { type: 'SELF_TRANSFER' }), ctx())).toMatchObject({
      categoryId: 'cat-self',
      source: 'type',
    });
  });

  it('uses the counterparty a statement states separately', () => {
    const c = categorize(row('Paid to Swiggy Limited', { counterparty: 'Swiggy Limited' }), ctx());
    expect(c).toMatchObject({ merchantName: 'Swiggy', categoryId: 'cat-delivery' });
    const person = categorize(row('Paid to Ravi Kumar', { counterparty: 'Ravi Kumar' }), ctx());
    expect(person.merchantName).toBe('Ravi Kumar');
  });

  it('leaves unknown merchants uncategorised with a readable name', () => {
    expect(categorize(row('UPI-RAVI KUMAR-ravi@okhdfc-424600000001'), ctx())).toMatchObject({
      merchantName: 'Ravi Kumar',
      categoryId: null,
      confidence: null,
      source: 'none',
    });
  });
});
