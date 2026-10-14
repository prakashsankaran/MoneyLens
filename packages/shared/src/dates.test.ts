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
  dayRangeUtc,
  isValidCalendarDate,
  parseDayKey,
  addDays,
  daysInRange,
  monthsInRange,
  monthDayRange,
  isWholeMonthRange,
  previousRange,
  dayRangeBoundsUtc,
  yearBeforeRange,
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

describe('day ranges', () => {
  it('bounds an IST day in UTC', () => {
    const { start, end } = dayRangeUtc('2026-10-01');
    expect(start.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-10-01T18:30:00.000Z');
  });

  it('rejects impossible dates', () => {
    expect(() => parseDayKey('2026-04-31')).toThrow();
    expect(() => parseDayKey('2026-02-29')).toThrow();
    expect(parseDayKey('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
    expect(isValidCalendarDate(2026, 13, 1)).toBe(false);
  });
});

describe('day ranges', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysInRange('2026-01-01', '2026-12-31')).toBe(365);
  });

  it('lists the months a range touches', () => {
    expect(monthsInRange('2025-11-15', '2026-02-03')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(monthDayRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('compares whole months with the same number of months before', () => {
    expect(isWholeMonthRange('2026-08-01', '2026-10-31')).toBe(true);
    expect(previousRange('2026-08-01', '2026-10-31')).toEqual({
      from: '2026-05-01',
      to: '2026-07-31',
    });
    expect(previousRange('2026-01-01', '2026-12-31')).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
    });
  });

  it('compares other ranges with the same number of days before', () => {
    expect(isWholeMonthRange('2026-08-10', '2026-10-31')).toBe(false);
    expect(previousRange('2026-10-01', '2026-10-13')).toEqual({
      from: '2026-09-18',
      to: '2026-09-30',
    });
  });

  it('finds the same dates a year earlier', () => {
    expect(yearBeforeRange('2026-01-01', '2026-10-13')).toEqual({
      from: '2025-01-01',
      to: '2025-10-13',
    });
    expect(yearBeforeRange('2028-02-01', '2028-02-29').to).toBe('2027-02-28');
  });

  it('bounds a day range in UTC', () => {
    const { start, end } = dayRangeBoundsUtc('2026-10-01', '2026-10-31');
    expect(start.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-10-31T18:30:00.000Z');
  });
});
