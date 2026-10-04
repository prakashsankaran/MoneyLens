import { describe, expect, it } from 'vitest';
import { dayKeyOf, istDate } from '@moneylens/shared';
import { detectDayOrder, parseStatementDate } from './dates';

describe('parseStatementDate', () => {
  it.each([
    ['2026-09-05', '2026-09-05'],
    ['05/09/2026', '2026-09-05'],
    ['05-09-26', '2026-09-05'],
    ['5.9.2026', '2026-09-05'],
    ['05 Sep 2026', '2026-09-05'],
    ['05-Sep-26', '2026-09-05'],
    ['5 September 2026', '2026-09-05'],
    ['Sep 5, 2026', '2026-09-05'],
    ['September 5th, 2026', '2026-09-05'],
  ])('reads %s', (raw, expected) => {
    const d = parseStatementDate(raw);
    expect(d && dayKeyOf(d)).toBe(expected);
  });

  it('uses noon IST for date-only values and keeps explicit times', () => {
    expect(parseStatementDate('2026-09-05')).toEqual(istDate(2026, 9, 5, 12, 0));
    expect(parseStatementDate('05/09/2026 23:45')).toEqual(istDate(2026, 9, 5, 23, 45));
    expect(parseStatementDate('05/09/2026 12:05 AM')).toEqual(istDate(2026, 9, 5, 0, 5));
    expect(parseStatementDate('05/09/2026 1:30 pm')).toEqual(istDate(2026, 9, 5, 13, 30));
  });

  it('honours month-first order when told to', () => {
    expect(dayKeyOf(parseStatementDate('09/05/2026', 'MDY')!)).toBe('2026-09-05');
  });

  it.each(['', 'yesterday', '31/04/2026', '2026-02-30', '32/01/2026', '01/13/2026', '1999-01-01'])(
    'rejects %j',
    (raw) => {
      expect(parseStatementDate(raw)).toBeNull();
    },
  );
});

describe('detectDayOrder', () => {
  it('detects day-first from a day above 12', () => {
    expect(detectDayOrder(['01/09/2026', '25/09/2026'])).toEqual({ order: 'DMY', assumed: false });
  });
  it('detects month-first from a second component above 12', () => {
    expect(detectDayOrder(['09/01/2026', '09/25/2026'])).toEqual({ order: 'MDY', assumed: false });
  });
  it('assumes day-first when ambiguous', () => {
    expect(detectDayOrder(['01/02/2026', '03/04/2026'])).toEqual({ order: 'DMY', assumed: true });
  });
  it('is not affected by ISO dates', () => {
    expect(detectDayOrder(['2026-09-25'])).toEqual({ order: 'DMY', assumed: true });
  });
});
