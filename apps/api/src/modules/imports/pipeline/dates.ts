import { istDate, isValidCalendarDate } from '@moneylens/shared';

/**
 * Statement date parsing. Indian statements normally use day-first dates, but
 * exports vary, so the order of numeric dates is decided once per file from
 * the values themselves (see `detectDayOrder`).
 */

export type DayOrder = 'DMY' | 'MDY';

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const ISO = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/;
const NUMERIC = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/;
const DAY_MONTH_NAME = /^(\d{1,2})[\s\-/.]*([A-Za-z]{3,9})[\s\-/.,]*(\d{2}|\d{4})\b/;
const MONTH_NAME_DAY = /^([A-Za-z]{3,9})[\s\-/.]*(\d{1,2})(?:st|nd|rd|th)?[\s,\-/.]+(\d{4})\b/;
const TIME = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?/;

/** Noon IST for date-only values keeps them safely inside the right day. */
const DEFAULT_HOUR = 12;

function fullYear(y: string): number {
  const n = Number(y);
  return y.length === 2 ? 2000 + n : n;
}

/**
 * Inspect every numeric date in a column: a first component above 12 proves
 * day-first; a second component above 12 proves month-first. Without proof we
 * assume day-first (the Indian convention) and report that we assumed it.
 * Columns without numeric dates (ISO, "05 Sep 2026") need no assumption.
 */
export function detectDayOrder(values: readonly string[]): { order: DayOrder; assumed: boolean } {
  let dmy = false;
  let mdy = false;
  let numeric = false;
  for (const value of values) {
    const m = NUMERIC.exec(value.trim());
    if (!m) continue;
    numeric = true;
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
  }
  if (mdy && !dmy) return { order: 'MDY', assumed: false };
  // Only numeric dates can be ambiguous; ISO and month-name dates are not.
  return { order: 'DMY', assumed: numeric && !dmy };
}

/** Parse a statement date (optionally with a time) as an IST instant, or null. */
export function parseStatementDate(raw: string, order: DayOrder = 'DMY'): Date | null {
  const value = raw.trim();
  if (!value) return null;

  let year: number;
  let month: number;
  let day: number;
  let m: RegExpExecArray | null;

  if ((m = ISO.exec(value))) {
    [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = NUMERIC.exec(value))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    [day, month] = order === 'DMY' ? [a, b] : [b, a];
    year = fullYear(m[3] as string);
  } else if ((m = DAY_MONTH_NAME.exec(value))) {
    const mon = MONTHS[(m[2] as string).toLowerCase()];
    if (!mon) return null;
    [day, month, year] = [Number(m[1]), mon, fullYear(m[3] as string)];
  } else if ((m = MONTH_NAME_DAY.exec(value))) {
    const mon = MONTHS[(m[1] as string).toLowerCase()];
    if (!mon) return null;
    [month, day, year] = [mon, Number(m[2]), Number(m[3])];
  } else {
    return null;
  }

  if (!isValidCalendarDate(year, month, day) || year < 2000 || year > 2100) return null;

  let hour = DEFAULT_HOUR;
  let minute = 0;
  const t = TIME.exec(value.slice(m[0].length));
  if (t) {
    hour = Number(t[1]);
    minute = Number(t[2]);
    const meridiem = t[3]?.toLowerCase();
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) {
      hour = DEFAULT_HOUR;
      minute = 0;
    }
  }
  return istDate(year, month, day, hour, minute);
}
