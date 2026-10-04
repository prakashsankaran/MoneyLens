/**
 * Calendar helpers. MoneyLens buckets transactions by calendar month in
 * India Standard Time (UTC+05:30, no daylight saving), regardless of the
 * server's timezone.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Shift a UTC instant so that its UTC fields read as IST wall-clock time. */
function toIstWallClock(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MS);
}

/** "YYYY-MM" of the given instant in IST. */
export function monthKeyOf(date: Date): string {
  const d = toIstWallClock(date);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

/** "YYYY-MM-DD" of the given instant in IST. */
export function dayKeyOf(date: Date): string {
  const d = toIstWallClock(date);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** 0 = Sunday ... 6 = Saturday, in IST. */
export function istWeekday(date: Date): number {
  return toIstWallClock(date).getUTCDay();
}

export function parseMonthKey(key: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Invalid month key: "${key}"`);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid month key: "${key}"`);
  return { year: Number(match[1]), month };
}

/** Add (or subtract) whole months to a month key. */
export function addMonths(key: string, delta: number): string {
  const { year, month } = parseMonthKey(key);
  const index = year * 12 + (month - 1) + delta;
  return `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`;
}

/** UTC instants bounding an IST calendar month: [start, end). */
export function monthRangeUtc(key: string): { start: Date; end: Date } {
  const { year, month } = parseMonthKey(key);
  const start = new Date(Date.UTC(year, month - 1, 1) - IST_OFFSET_MS);
  const end = new Date(Date.UTC(year, month, 1) - IST_OFFSET_MS);
  return { start, end };
}

/** The `count` month keys ending at `endKey` inclusive, oldest first. */
export function monthsEnding(endKey: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(endKey, i - count + 1));
}

/** IST instant for a wall-clock date/time, e.g. istDate(2026, 9, 14, 13, 5). */
export function istDate(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - IST_OFFSET_MS);
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "September 2026" or, with short, "Sep". */
export function formatMonthKey(key: string, opts: { short?: boolean } = {}): string {
  const { year, month } = parseMonthKey(key);
  const name = MONTH_NAMES[month - 1] ?? '';
  return opts.short ? name.slice(0, 3) : `${name} ${year}`;
}
