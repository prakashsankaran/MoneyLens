import { describe, expect, it } from 'vitest';
import { istDate } from '@moneylens/shared';
import { importStats, type ImportStatsRow } from './imports';

const row = (overrides: Partial<ImportStatsRow> = {}): ImportStatsRow => ({
  date: istDate(2026, 9, 10, 12),
  amountPaise: 10_000,
  flow: 'OUT',
  decision: 'INCLUDE',
  categoryId: 'food',
  ...overrides,
});

describe('importStats', () => {
  it('summarises an empty import', () => {
    expect(importStats([])).toEqual({
      detected: 0,
      included: 0,
      excluded: 0,
      possibleDuplicates: 0,
      uncategorized: 0,
      firstDate: null,
      lastDate: null,
      totalDebitsPaise: 0,
      totalCreditsPaise: 0,
    });
  });

  it('totals only included rows but spans every detected date', () => {
    const stats = importStats([
      row({ date: istDate(2026, 9, 1, 12), amountPaise: 50_000 }),
      row({ date: istDate(2026, 9, 30, 23, 45), flow: 'IN', amountPaise: 1_000_000 }),
      row({ decision: 'EXCLUDE', amountPaise: 999_999 }),
      row({ decision: 'DUPLICATE', amountPaise: 777_777, date: istDate(2026, 8, 31, 12) }),
      row({ categoryId: null, amountPaise: 2_500 }),
    ]);
    expect(stats).toEqual({
      detected: 5,
      included: 3,
      excluded: 2,
      possibleDuplicates: 1,
      uncategorized: 1,
      firstDate: '2026-08-31',
      lastDate: '2026-09-30',
      totalDebitsPaise: 52_500,
      totalCreditsPaise: 1_000_000,
    });
  });
});
