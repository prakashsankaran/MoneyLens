import { describe, expect, it } from 'vitest';
import { istDate } from '@moneylens/shared';
import { findDuplicates, scoreMatch, type DuplicateCandidate } from './duplicates';

const base: DuplicateCandidate = {
  date: istDate(2026, 9, 5, 13),
  amountPaise: 45_000,
  flow: 'OUT',
  reference: null,
  merchantKey: 'SWIGGY',
  upiId: null,
};
const tx = (id: string, overrides: Partial<DuplicateCandidate> = {}) => ({
  id,
  ...base,
  ...overrides,
});

describe('scoreMatch', () => {
  it('treats equal references as the same payment and different ones as different', () => {
    expect(
      scoreMatch({ ...base, reference: '1234567' }, { ...base, reference: '1234567' }).score,
    ).toBe(10);
    expect(
      scoreMatch({ ...base, reference: '1234567' }, { ...base, reference: '7654321' }).score,
    ).toBe(0);
  });

  it('needs the same amount and direction', () => {
    expect(scoreMatch(base, { ...base, amountPaise: 45_001 }).score).toBe(0);
    expect(scoreMatch(base, { ...base, flow: 'IN' }).score).toBe(0);
  });

  it('scores day, merchant and UPI ID', () => {
    expect(scoreMatch(base, base)).toEqual({
      score: 6,
      reasons: ['same amount', 'same day', 'same merchant'],
    });
    // Late evening and the next morning in IST are one day apart.
    const nextDay = { ...base, date: istDate(2026, 9, 6, 9), merchantKey: null, upiId: 'a@ok' };
    expect(scoreMatch({ ...base, upiId: 'a@ok' }, nextDay).score).toBe(1 + 3);
    expect(scoreMatch(base, { ...base, date: istDate(2026, 9, 8, 13) }).score).toBe(0);
  });
});

describe('findDuplicates', () => {
  it('flags a likely repeat with a readable reason', () => {
    const [match] = findDuplicates([base], [tx('t1')]);
    expect(match).toEqual({
      duplicateOfId: 't1',
      reason: 'Same amount, same day and same merchant as a transaction you already have',
    });
  });

  it('keeps the reference reason wording', () => {
    const [match] = findDuplicates(
      [{ ...base, reference: '424698765432' }],
      [tx('t1', { reference: '424698765432', date: istDate(2026, 1, 1) })],
    );
    expect(match?.reason).toBe('Same reference number as a transaction you already have');
  });

  it('does not flag same-amount payments to different merchants on the same day', () => {
    expect(findDuplicates([base], [tx('t1', { merchantKey: 'ZOMATO' })])).toEqual([null]);
  });

  it('matches each existing transaction once', () => {
    // Two ₹450 Swiggy orders in the file, one already recorded: only one is a duplicate.
    expect(findDuplicates([base, base], [tx('t1')]).map((m) => m?.duplicateOfId ?? null)).toEqual([
      't1',
      null,
    ]);
  });

  it('prefers the strongest match', () => {
    const [match] = findDuplicates(
      [{ ...base, upiId: 'swiggy@icici' }],
      [tx('weak', { date: istDate(2026, 9, 4, 13) }), tx('strong', { upiId: 'swiggy@icici' })],
    );
    expect(match?.duplicateOfId).toBe('strong');
  });

  it('within one file, only repeated reference numbers count', () => {
    const rows = [{ ...base, reference: '111111' }, { ...base, reference: '111111' }, base, base];
    expect(findDuplicates(rows, []).map((m) => m?.reason ?? null)).toEqual([
      null,
      'Same reference number as an earlier row in this file',
      null,
      null,
    ]);
  });
});
