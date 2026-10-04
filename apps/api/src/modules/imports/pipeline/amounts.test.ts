import { describe, expect, it } from 'vitest';
import { parseStatementAmount } from './amounts';

describe('parseStatementAmount', () => {
  it.each([
    ['1,23,456.78', 12_345_678, null],
    ['₹ 450', 45_000, null],
    ['Rs. 99.5', 9_950, null],
    ['INR 1,000', 100_000, null],
    ['-250.00', 25_000, 'OUT'],
    ['(250.00)', 25_000, 'OUT'],
    ['₹-75', 7_500, 'OUT'],
    ['+10', 1_000, null],
    ['1,200.00 Dr', 120_000, 'OUT'],
    ['500 CR', 50_000, 'IN'],
    ['12.345', 1_235, null],
  ] as const)('parses %j', (raw, paise, flow) => {
    expect(parseStatementAmount(raw)).toEqual({ paise, flow });
  });

  it.each([undefined, '', ' ', '-', '0', '0.00', 'abc', '1.2.3'])('returns null for %j', (raw) => {
    expect(parseStatementAmount(raw)).toBeNull();
  });
});
