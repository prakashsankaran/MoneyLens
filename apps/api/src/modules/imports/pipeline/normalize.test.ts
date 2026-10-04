import { describe, expect, it } from 'vitest';
import {
  extractReference,
  extractUpiId,
  inferTransactionType,
  normalizeReference,
} from './normalize';

describe('extractUpiId', () => {
  it('finds UPI handles in narrations', () => {
    expect(extractUpiId('UPI-SWIGGY-Swiggy.Demo@ICICI-ICIC0000001-4246')).toBe('swiggy.demo@icici');
  });
  it('ignores e-mail addresses', () => {
    expect(extractUpiId('Invoice sent to someone@gmail.com')).toBeNull();
  });
});

describe('extractReference', () => {
  it('finds a 12-digit UPI reference', () => {
    expect(extractReference('UPI-ZOMATO-424698765432-PAY')).toBe('424698765432');
  });
  it('ignores short numbers', () => {
    expect(extractReference('Order 12345')).toBeNull();
  });
});

describe('inferTransactionType', () => {
  it.each([
    ['Refund - Flipkart order', 'IN', 'REFUND'],
    ['UPI REV 4242', 'IN', 'REFUND'],
    ['Cashback from Google Pay', 'IN', 'CASHBACK'],
    ['Self transfer to savings', 'OUT', 'SELF_TRANSFER'],
    ['NEFT CR SALARY', 'IN', 'CREDIT'],
    ['SWIGGY', 'OUT', 'DEBIT'],
    // "Refund" on an outgoing payment is not a refund to the user.
    ['Refund to customer', 'OUT', 'DEBIT'],
  ] as const)('%s (%s) -> %s', (description, flow, expected) => {
    expect(inferTransactionType(description, flow)).toBe(expected);
  });

  it('normalises references and drops placeholders', () => {
    expect(normalizeReference('0000424612345678')).toBe('424612345678');
    expect(normalizeReference(' N244260012345 ')).toBe('N244260012345');
    expect(normalizeReference('0000000000')).toBeNull();
    expect(normalizeReference('12-34')).toBeNull();
    expect(normalizeReference(undefined)).toBeNull();
  });
});
