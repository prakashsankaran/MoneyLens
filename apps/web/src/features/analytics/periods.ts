import {
  addMonths,
  dayKeyOf,
  daysInRange,
  formatMonthKey,
  isWholeMonthRange,
  monthDayRange,
  monthsInRange,
} from '@moneylens/shared';
import type { PeriodCompare } from '@moneylens/types';

export const PERIOD_PRESETS = [
  { id: 'month', label: 'Month' },
  { id: '3m', label: '3 months' },
  { id: '6m', label: '6 months' },
  { id: '12m', label: '12 months' },
  { id: 'year', label: 'This year' },
  { id: 'custom', label: 'Custom' },
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number]['id'];

export interface PeriodRange {
  from: string;
  to: string;
  compare: PeriodCompare;
}

export function isPeriodPreset(value: string | null): value is PeriodPreset {
  return PERIOD_PRESETS.some((p) => p.id === value);
}

/**
 * The days a preset covers. "Last N months" are whole months ending with the
 * latest month that has data, so an import from a while ago still fills the
 * view; "This year" runs from 1 January to today and is compared with the
 * same dates last year.
 */
export function presetRange(
  preset: Exclude<PeriodPreset, 'month' | 'custom'>,
  latestMonth: string,
  today: Date = new Date(),
): PeriodRange {
  if (preset === 'year') {
    const day = dayKeyOf(today);
    return { from: `${day.slice(0, 4)}-01-01`, to: day, compare: 'lastYear' };
  }
  const count = { '3m': 3, '6m': 6, '12m': 12 }[preset];
  return {
    from: monthDayRange(addMonths(latestMonth, 1 - count)).from,
    to: monthDayRange(latestMonth).to,
    compare: 'previous',
  };
}

const shortDay = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const asDate = (key: string) => new Date(`${key}T00:00:00Z`);

/** "Aug – Oct 2026", "Nov 2025 – Oct 2026" or "16 Sept – 31 Oct 2026". */
export function formatRange(from: string, to: string): string {
  if (isWholeMonthRange(from, to)) {
    const [first, last] = [from.slice(0, 7), to.slice(0, 7)];
    if (first === last) return formatMonthKey(first);
    const sameYear = first.slice(0, 4) === last.slice(0, 4);
    const start = sameYear ? formatMonthKey(first, { short: true }) : shortMonthYear(first);
    return `${start} – ${shortMonthYear(last)}`;
  }
  const [a, b] = [shortDay.format(asDate(from)), shortDay.format(asDate(to))];
  if (from === to) return a;
  return from.slice(0, 4) === to.slice(0, 4) ? `${a.replace(/ \d{4}$/, '')} – ${b}` : `${a} – ${b}`;
}

function shortMonthYear(month: string): string {
  return `${formatMonthKey(month, { short: true })} ${month.slice(0, 4)}`;
}

/** "3 months", "92 days": how long the range is, in the unit a person would use. */
export function rangeLength(from: string, to: string): string {
  if (isWholeMonthRange(from, to)) {
    const n = monthsInRange(from, to).length;
    return `${n} ${n === 1 ? 'month' : 'months'}`;
  }
  const n = daysInRange(from, to);
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}
