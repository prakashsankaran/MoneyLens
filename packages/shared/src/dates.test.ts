import { describe, expect, it } from 'vitest';
import {
  addMonths,
  dayKeyOf,
  formatMonthKey,
  istDate,
  istWeekday,
  monthKeyOf,
  monthRangeUtc,
  monthsEnding,
  parseMonthKey,
} from './dates';

describe('IST month bucketing', () => {
  it('assigns late-evening UTC instants to the next IST day/month', () => {
    // 2026-09-30T19:00Z is 2026-10-01 00:30 IST.
    const d = new Date('2026-09-30T19:00:00Z');
    expect(monthKeyOf(d)).toBe('2026-10');
    expect(dayKeyOf(d)).toBe('2026-10-01');
  });

  it('builds month ranges as [start, end) in UTC', () => {
    const { start, end } = monthRangeUtc('2026-09');
    expect(start.toISOString()).toBe('2026-08-31T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-09-30T18:30:00.000Z');
  });

  it('round-trips istDate through monthKeyOf', () => {
    expect(monthKeyOf(istDate(2026, 1, 1, 0, 0))).toBe('2026-01');
    expect(monthKeyOf(istDate(2025, 12, 31, 23, 59))).toBe('2025-12');
  });

  it('computes IST weekdays', () => {
    // 4 Oct 2026 is a Sunday.
    expect(istWeekday(istDate(2026, 10, 4, 1, 0))).toBe(0);
  });
});

describe('month arithmetic', () => {
  it('adds and subtracts months across years', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-05', 0)).toBe('2026-05');
  });

  it('lists months ending at a key, oldest first', () => {
    expect(monthsEnding('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('rejects malformed keys', () => {
    expect(() => parseMonthKey('2026-13')).toThrow();
    expect(() => parseMonthKey('2026-9')).toThrow();
  });

  it('formats month names', () => {
    expect(formatMonthKey('2026-09')).toBe('September 2026');
    expect(formatMonthKey('2026-09', { short: true })).toBe('Sep');
  });
});
