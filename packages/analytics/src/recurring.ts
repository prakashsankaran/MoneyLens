import { addMonths, dayKeyOf, parseDayKey } from '@moneylens/shared';
import type {
  AnalyticsTransaction,
  CategoryRef,
  RecurringFrequencyKind,
  RecurringSeries,
} from '@moneylens/types';
import { classifyTransaction } from './classify';
import { mean, median } from './stats';

const DAY_MS = 86_400_000;

/** Interval bands (days) and how far one payment may drift from the median. */
const FREQUENCIES: {
  kind: RecurringFrequencyKind;
  min: number;
  max: number;
  tolerance: number;
  perMonth: number;
  /** Calendar months between payments; 0 means step by days. */
  stepMonths: number;
}[] = [
  { kind: 'WEEKLY', min: 6, max: 8, tolerance: 2, perMonth: 52 / 12, stepMonths: 0 },
  { kind: 'MONTHLY', min: 25, max: 35, tolerance: 5, perMonth: 1, stepMonths: 1 },
  { kind: 'QUARTERLY', min: 84, max: 98, tolerance: 10, perMonth: 1 / 3, stepMonths: 3 },
  { kind: 'YEARLY', min: 350, max: 380, tolerance: 15, perMonth: 1 / 12, stepMonths: 12 },
];

export interface RecurringOptions {
  /** "Today" for deciding whether a series is still active. */
  asOf: Date;
  /** Category tree, used to keep subscriptions apart from rent, EMIs and transfers. */
  categories?: readonly CategoryRef[];
  /** Series scoring below this are not reported. */
  minConfidence?: number;
}

/**
 * Fixed payments that are obligations or utilities rather than subscriptions:
 * top-level categories, and subcategories, by slug.
 */
const NOT_SUBSCRIPTIONS = new Set([
  'housing',
  'financial',
  'transfers',
  'income',
  'transport',
  'healthcare',
]);
const NOT_SUBSCRIPTION_LEAVES = new Set(['electricity', 'water', 'maintenance', 'groceries']);
/** A subscription-like payment has a near-fixed amount below this (₹5,000). */
const SUBSCRIPTION_MAX_PAISE = 500_000;

function dayNumber(date: Date): number {
  const { year, month, day } = parseDayKey(dayKeyOf(date));
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

function dayKeyFromNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/** Same day of the month, `months` later, clamped to the month's last day. */
function addCalendarMonths(dayKey: string, months: number): string {
  const { day } = parseDayKey(dayKey);
  const month = addMonths(dayKey.slice(0, 7), months);
  const { year, month: m } = parseDayKey(`${month}-01`);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

/** Coefficient of variation (standard deviation / mean). */
function variation(values: readonly number[]): number {
  const m = mean(values);
  if (m === 0) return 0;
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance) / m;
}

/**
 * Split a merchant's payments into amount bands so that a monthly ₹649
 * subscription is found even when the same merchant also has one-off orders.
 * Amounts within 20% of a band's first (smallest) amount share the band.
 */
function amountBands(txs: AnalyticsTransaction[]): AnalyticsTransaction[][] {
  const sorted = [...txs].sort((a, b) => a.amountPaise - b.amountPaise);
  const bands: AnalyticsTransaction[][] = [];
  for (const tx of sorted) {
    const band = bands.at(-1);
    const base = band?.[0]?.amountPaise ?? 0;
    if (band && tx.amountPaise <= base * 1.2) band.push(tx);
    else bands.push([tx]);
  }
  return bands;
}

function evaluate(
  txs: AnalyticsTransaction[],
  key: string,
  opts: RecurringOptions,
  slugsOf: (categoryId: string | null) => string[],
): RecurringSeries | null {
  // One payment per day: two payments on the same day are not a schedule.
  const byDay = new Map<number, AnalyticsTransaction>();
  for (const tx of [...txs].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    const day = dayNumber(tx.date);
    if (!byDay.has(day)) byDay.set(day, tx);
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const series = days.map((d) => byDay.get(d) as AnalyticsTransaction);
  if (series.length < 2) return null;

  const intervals = days.slice(1).map((d, i) => d - (days[i] as number));
  const interval = median(intervals);
  const band = FREQUENCIES.find((f) => interval >= f.min && interval <= f.max);
  if (!band) return null;
  // Yearly payments may have only two occurrences; everything else needs three.
  if (series.length < (band.kind === 'YEARLY' ? 2 : 3)) return null;

  const regular = intervals.filter((i) => Math.abs(i - interval) <= band.tolerance).length;
  const regularity = regular / intervals.length;
  if (regularity < 0.75) return null;

  const amounts = series.map((t) => t.amountPaise);
  const cv = variation(amounts);
  const amountScore = Math.max(0, Math.min(1, (0.5 - cv) / 0.45));
  const historyScore = Math.min(1, series.length / 6);
  const confidence =
    Math.round((0.5 * regularity + 0.3 * amountScore + 0.2 * historyScore) * 100) / 100;
  if (confidence < (opts.minConfidence ?? 0.6)) return null;

  const first = series[0] as AnalyticsTransaction;
  const last = series.at(-1) as AnalyticsTransaction;
  const typical = median(amounts);
  const lastDay = days.at(-1) as number;
  const overdueBy = dayNumber(opts.asOf) - lastDay - interval;
  const flow = last.flow;
  const categoryId = last.categoryId;
  const slugs = slugsOf(categoryId);
  const monthly = Math.round(typical * band.perMonth);

  return {
    key,
    merchantId: last.merchantId,
    label: last.merchantName ?? 'Unknown',
    flow,
    categoryId,
    frequency: band.kind,
    intervalDays: interval,
    typicalAmountPaise: typical,
    amountVaries: cv > 0.15,
    occurrences: series.length,
    firstDate: dayKeyOf(first.date),
    lastDate: dayKeyOf(last.date),
    // Monthly bills fall on a date, not every N days, so step by calendar months.
    nextExpectedDate: band.stepMonths
      ? addCalendarMonths(dayKeyOf(last.date), band.stepMonths)
      : dayKeyFromNumber(lastDay + interval),
    monthlyEquivalentPaise: monthly,
    annualEquivalentPaise: monthly * 12,
    confidence,
    subscriptionLike:
      flow === 'OUT' &&
      band.kind !== 'WEEKLY' &&
      cv <= 0.05 &&
      typical <= SUBSCRIPTION_MAX_PAISE &&
      !slugs.some((x) => NOT_SUBSCRIPTIONS.has(x) || NOT_SUBSCRIPTION_LEAVES.has(x)),
    active: overdueBy <= interval / 2 + band.tolerance,
    transactionIds: series.map((t) => t.id),
  };
}

/**
 * Find payments and income that repeat on a weekly, monthly, quarterly or
 * yearly schedule. Deterministic: transactions are grouped by merchant and
 * direction (then by amount band), and a group is recurring when the gaps
 * between payments sit in one frequency band at least 75% of the time.
 * Self transfers are ignored.
 */
export function detectRecurring(
  txs: readonly AnalyticsTransaction[],
  opts: RecurringOptions,
): RecurringSeries[] {
  const byId = new Map((opts.categories ?? []).map((c) => [c.id, c]));
  // Slugs of the category and its parent, for the subscription check.
  const slugsOf = (id: string | null): string[] => {
    const out: string[] = [];
    let c = id ? byId.get(id) : undefined;
    while (c) {
      out.push(c.slug);
      c = c.parentId ? byId.get(c.parentId) : undefined;
    }
    return out;
  };

  const groups = new Map<string, AnalyticsTransaction[]>();
  for (const tx of txs) {
    const cls = classifyTransaction(tx);
    if (cls !== 'spend' && cls !== 'income') continue;
    if (!tx.merchantName && !tx.merchantId) continue;
    const merchant = tx.merchantId ?? `name:${(tx.merchantName as string).toLowerCase()}`;
    const key = `${merchant}|${tx.flow}`;
    const list = groups.get(key);
    if (list) list.push(tx);
    else groups.set(key, [tx]);
  }

  const found: RecurringSeries[] = [];
  for (const [key, list] of groups) {
    const whole = evaluate(list, key, opts, slugsOf);
    if (whole) {
      found.push(whole);
      continue;
    }
    // A merchant with mixed payments: look for a regular amount band inside it.
    let best: RecurringSeries | null = null;
    for (const band of amountBands(list)) {
      if (band.length < 2) continue;
      const bandKey = `${key}|${band[0]?.amountPaise ?? 0}`;
      const candidate = evaluate(band, bandKey, opts, slugsOf);
      if (candidate && (!best || candidate.confidence > best.confidence)) best = candidate;
    }
    if (best) found.push(best);
  }

  return found.sort(
    (a, b) => b.monthlyEquivalentPaise - a.monthlyEquivalentPaise || a.label.localeCompare(b.label),
  );
}
