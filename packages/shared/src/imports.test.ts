import { describe, expect, it } from 'vitest';
import type { ImportRow } from '@moneylens/types';
import { groupRowsByMerchant, merchantGroupSummary } from './imports';

const row = (id: string, merchantName: string | null, amountPaise: number, flow: 'IN' | 'OUT') =>
  ({ id, merchantName, amountPaise, flow, rawDescription: `UPI ${id}` }) as ImportRow;

describe('groupRowsByMerchant', () => {
  it('groups by merchant, biggest first, with totals each way', () => {
    const groups = groupRowsByMerchant([
      row('a', 'Meena', 5_000, 'OUT'),
      row('b', 'Ravi', 10_000, 'OUT'),
      row('c', 'Ravi', 2_000, 'IN'),
      row('d', null, 100, 'OUT'),
    ]);
    expect(groups.map((g) => [g.merchant, g.rowIds])).toEqual([
      ['Ravi', ['b', 'c']],
      ['Meena', ['a']],
      ['Unknown', ['d']],
    ]);
    expect(merchantGroupSummary(groups[0]!)).toBe('2 rows · ₹100 out · ₹20 in');
    expect(merchantGroupSummary(groups[1]!)).toBe('1 row · ₹50 out');
  });
});
