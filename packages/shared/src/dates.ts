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

export function parseDayKey(key: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Invalid date: "${key}"`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (!isValidCalendarDate(year, month, day)) throw new Error(`Invalid date: "${key}"`);
  return { year, month, day };
}

/** True when the year/month/day combination exists (e.g. rejects 31 April). */
export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** UTC instants bounding an IST calendar day: [start, end). */
export function dayRangeUtc(key: string): { start: Date; end: Date } {
  const { year, month, day } = parseDayKey(key);
  const start = istDate(year, month, day);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayIndex(key: string): number {
  const { year, month, day } = parseDayKey(key);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

function dayKeyFromIndex(index: number): string {
  return new Date(index * DAY_MS).toISOString().slice(0, 10);
}

/** Add (or subtract) whole days to a "YYYY-MM-DD" key. */
export function addDays(key: string, delta: number): string {
  return dayKeyFromIndex(dayIndex(key) + delta);
}

/** Number of calendar days from `from` to `to`, both included. */
export function daysInRange(from: string, to: string): number {
  return dayIndex(to) - dayIndex(from) + 1;
}

/** "YYYY-MM-DD" of the first and last day of a month key. */
export function monthDayRange(key: string): { from: string; to: string } {
  const { year, month } = parseMonthKey(key);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${key}-01`, to: `${key}-${pad2(last)}` };
}

/** Month keys touched by a day range, oldest first. */
export function monthsInRange(from: string, to: string): string[] {
  const first = from.slice(0, 7);
  const last = to.slice(0, 7);
  const months: string[] = [];
  for (let m = first; m <= last; m = addMonths(m, 1)) months.push(m);
  return months;
}

/** True when the range starts on the 1st of a month and ends on a month's last day. */
export function isWholeMonthRange(from: string, to: string): boolean {
  return from.endsWith('-01') && monthDayRange(to.slice(0, 7)).to === to;
}

/**
 * The period just before a range, the same length: the same number of whole
 * months when the range is whole months (so Jul–Sep compares with Apr–Jun),
 * otherwise the same number of days.
 */
export function previousRange(from: string, to: string): { from: string; to: string } {
  if (isWholeMonthRange(from, to)) {
    const count = monthsInRange(from, to).length;
    const start = addMonths(from.slice(0, 7), -count);
    return { from: monthDayRange(start).from, to: addDays(from, -1) };
  }
  const days = daysInRange(from, to);
  return { from: addDays(from, -days), to: addDays(from, -1) };
}

/** The same dates one year earlier; 29 February becomes the 28th. */
export function yearBeforeRange(from: string, to: string): { from: string; to: string } {
  const back = (key: string) => {
    const { year, month, day } = parseDayKey(key);
    const last = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
    return `${year - 1}-${pad2(month)}-${pad2(Math.min(day, last))}`;
  };
  return { from: back(from), to: back(to) };
}

/** UTC instants bounding an inclusive IST day range: [start, end). */
export function dayRangeBoundsUtc(from: string, to: string): { start: Date; end: Date } {
  return { start: dayRangeUtc(from).start, end: dayRangeUtc(to).end };
}
