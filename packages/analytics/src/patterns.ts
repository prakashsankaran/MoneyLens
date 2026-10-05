import {
  addMonths,
  dayKeyOf,
  istWeekday,
  monthKeyOf,
  monthsEnding,
  parseDayKey,
  parseMonthKey,
  percentOf,
} from '@moneylens/shared';
import type {
  AnalyticsTransaction,
  CategoryComparisonRow,
  CategoryRef,
  PeriodComparisonRow,
  SpendingPatterns,
  TransactionBrief,
} from '@moneylens/types';
import { classifyTransaction } from './classify';
import { mean } from './stats';
import { categoryBreakdown, groupByMonth, summarizePeriod, type CategoryLevel } from './summary';

const WEEKDAY_LABELS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
const DAY_MS = 86_400_000;

/** Net spending (spend minus refunds) of a set of transactions. */
export function spendingOf(txs: readonly AnalyticsTransaction[]): number {
  return summarizePeriod(txs).spendingPaise;
}

function change(now: number, before: number): number | null {
  return before === 0 ? null : percentOf(now - before, before);
}

/** Months from `months` that have any transactions. */
function withData(
  months: readonly string[],
  byMonth: Map<string, AnalyticsTransaction[]>,
): string[] {
  return months.filter((m) => (byMonth.get(m) ?? []).length > 0);
}

/**
 * Spending this month against the standard baselines: the previous month,
 * the 3- and 6-month averages, the previous quarter, and the same months of
 * last year to date. Averages only count months that have data.
 */
export function periodComparisons(
  txs: readonly AnalyticsTransaction[],
  month: string,
): PeriodComparisonRow[] {
  const byMonth = groupByMonth(txs);
  const spend = (m: string) => spendingOf(byMonth.get(m) ?? []);
  const current = spend(month);
  const rows: PeriodComparisonRow[] = [];

  const previous = addMonths(month, -1);
  const prevMonths = withData([previous], byMonth);
  rows.push(row('previous-month', 'Previous month', current, spend(previous), prevMonths.length));

  for (const [n, baseline] of [
    [3, 'avg-3'],
    [6, 'avg-6'],
  ] as const) {
    const months = withData(monthsEnding(previous, n), byMonth);
    rows.push(row(baseline, `${n}-month average`, current, mean(months.map(spend)), months.length));
  }

  // Calendar quarters: Jan–Mar, Apr–Jun, …
  const { year, month: m } = parseMonthKey(month);
  const quarterStart = `${year}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0')}`;
  const quarter = monthsEnding(addMonths(quarterStart, 2), 3);
  const prevQuarter = quarter.map((q) => addMonths(q, -3));
  const sumOf = (ms: readonly string[]) => ms.reduce((acc, q) => acc + spend(q), 0);
  rows.push(
    row(
      'quarter',
      `Q${Math.floor((m - 1) / 3) + 1} so far vs previous quarter`,
      sumOf(quarter.filter((q) => q <= month)),
      sumOf(prevQuarter.slice(0, quarter.filter((q) => q <= month).length)),
      withData(prevQuarter, byMonth).length,
    ),
  );

  const ytd = monthsEnding(month, m);
  const lastYtd = ytd.map((q) => addMonths(q, -12));
  rows.push(
    row(
      'ytd',
      `${year} to date vs ${year - 1} to date`,
      sumOf(ytd),
      sumOf(lastYtd),
      withData(lastYtd, byMonth).length,
    ),
  );
  return rows;
}

function row(
  baseline: PeriodComparisonRow['baseline'],
  label: string,
  currentPaise: number,
  baselinePaise: number,
  baselineMonths: number,
): PeriodComparisonRow {
  return {
    baseline,
    label,
    currentPaise,
    baselinePaise,
    changePaise: currentPaise - baselinePaise,
    changePct: baselineMonths === 0 ? null : change(currentPaise, baselinePaise),
    baselineMonths,
  };
}

/** Top-level category spending this month vs last month and the 3-month average. */
export function categoryComparisons(
  txs: readonly AnalyticsTransaction[],
  month: string,
  categories: readonly CategoryRef[],
  compareMonth: string = addMonths(month, -1),
  level: CategoryLevel = 'top',
): CategoryComparisonRow[] {
  const byMonth = groupByMonth(txs);
  const now = categoryBreakdown(byMonth.get(month) ?? [], categories, level);
  const before = categoryBreakdown(byMonth.get(compareMonth) ?? [], categories, level);
  const avgMonths = withData(monthsEnding(addMonths(month, -1), 3), byMonth);
  const avgBreakdowns = avgMonths.map((m) =>
    categoryBreakdown(byMonth.get(m) ?? [], categories, level),
  );

  const keys = new Map<string, (typeof now)[number]>();
  for (const r of [...now, ...before])
    keys.set(r.categoryId ?? 'none', keys.get(r.categoryId ?? 'none') ?? r);

  return [...keys.entries()]
    .map(([key, ref]) => {
      const find = (list: typeof now) => list.find((r) => (r.categoryId ?? 'none') === key);
      const cur = find(now);
      const prev = find(before);
      const average3 = mean(avgBreakdowns.map((b) => find(b)?.amountPaise ?? 0));
      const currentPaise = cur?.amountPaise ?? 0;
      return {
        categoryId: ref.categoryId,
        name: ref.name,
        slug: ref.slug,
        currentPaise,
        previousPaise: prev?.amountPaise ?? 0,
        average3Paise: average3,
        changeVsPreviousPct: prev ? change(currentPaise, prev.amountPaise) : null,
        changeVsAverage3Pct: avgMonths.length ? change(currentPaise, average3) : null,
        currentCount: cur?.transactionCount ?? 0,
        previousCount: prev?.transactionCount ?? 0,
      };
    })
    .sort((a, b) => b.currentPaise - a.currentPaise || b.previousPaise - a.previousPaise);
}

export function brief(tx: AnalyticsTransaction): TransactionBrief {
  return {
    id: tx.id,
    date: tx.date.toISOString(),
    merchantName: tx.merchantName,
    amountPaise: tx.amountPaise,
    flow: tx.flow,
    categoryId: tx.categoryId,
  };
}

/** Day keys of every IST calendar day in a month. */
function daysOfMonth(month: string): string[] {
  const { year, month: m } = parseMonthKey(month);
  const count = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

/** Monday = 0 … Sunday = 6, for an IST day key. */
function weekdayOfKey(key: string): number {
  const { year, month, day } = parseDayKey(key);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

/**
 * When and how the month's money was spent: weekday vs weekend, per weekday,
 * per week, volatility across months, largest payments, refunds, cashback and
 * transfers. `history` is the full set used for volatility (up to 6 months).
 */
export function spendingPatterns(
  txs: readonly AnalyticsTransaction[],
  month: string,
  opts: { volatilityMonths?: number; largest?: number } = {},
): SpendingPatterns {
  const { volatilityMonths = 6, largest = 5 } = opts;
  const byMonth = groupByMonth(txs);
  const current = byMonth.get(month) ?? [];
  const spend = current.filter((t) => classifyTransaction(t) === 'spend');

  const byWeekday = WEEKDAY_LABELS.map((label, weekday) => ({
    weekday,
    label,
    amountPaise: 0,
    transactionCount: 0,
  }));
  for (const tx of spend) {
    const bucket = byWeekday[(istWeekday(tx.date) + 6) % 7];
    if (bucket) {
      bucket.amountPaise += tx.amountPaise;
      bucket.transactionCount += 1;
    }
  }
  const days = daysOfMonth(month);
  const weekendDays = days.filter((d) => weekdayOfKey(d) >= 5).length;
  const weekdayDays = days.length - weekendDays;
  const weekendTotal = byWeekday.slice(5).reduce((a, b) => a + b.amountPaise, 0);
  const weekdayTotal = byWeekday.slice(0, 5).reduce((a, b) => a + b.amountPaise, 0);
  const weekdayAvg = Math.round(weekdayTotal / weekdayDays);
  const weekendAvg = Math.round(weekendTotal / weekendDays);

  // Weeks start on Monday; the first week may start in the previous month.
  const weekly = new Map<string, { amountPaise: number; transactionCount: number }>();
  for (const d of days) {
    const { year, month: m, day } = parseDayKey(d);
    const start = new Date(Date.UTC(year, m - 1, day) - weekdayOfKey(d) * DAY_MS)
      .toISOString()
      .slice(0, 10);
    if (!weekly.has(start)) weekly.set(start, { amountPaise: 0, transactionCount: 0 });
  }
  for (const tx of spend) {
    const key = dayKeyOf(tx.date);
    const { year, month: m, day } = parseDayKey(key);
    const start = new Date(Date.UTC(year, m - 1, day) - weekdayOfKey(key) * DAY_MS)
      .toISOString()
      .slice(0, 10);
    const w = weekly.get(start);
    if (w) {
      w.amountPaise += tx.amountPaise;
      w.transactionCount += 1;
    }
  }

  const volMonths = withData(monthsEnding(month, volatilityMonths), byMonth);
  const monthlySpend = volMonths.map((m) => spendingOf(byMonth.get(m) ?? []));
  const avg = mean(monthlySpend);
  const sd =
    monthlySpend.length > 1
      ? Math.sqrt(monthlySpend.reduce((a, v) => a + (v - avg) ** 2, 0) / monthlySpend.length)
      : 0;

  const tally = (pred: (t: AnalyticsTransaction) => boolean) => {
    const list = current.filter(pred);
    return { count: list.length, amountPaise: list.reduce((a, t) => a + t.amountPaise, 0) };
  };

  return {
    weekdayDailyAveragePaise: weekdayAvg,
    weekendDailyAveragePaise: weekendAvg,
    weekendRatio: weekdayAvg === 0 ? null : Math.round((weekendAvg / weekdayAvg) * 100) / 100,
    byWeekday,
    weekly: [...weekly.entries()].map(([weekStart, w]) => ({ weekStart, ...w })),
    monthlyVolatility: volMonths.length >= 3 && avg > 0 ? Math.round((sd / avg) * 100) / 100 : null,
    volatilityMonths: volMonths.length,
    largest: [...spend]
      .sort((a, b) => b.amountPaise - a.amountPaise)
      .slice(0, largest)
      .map(brief),
    refunds: tally((t) => classifyTransaction(t) === 'refund'),
    cashback: tally((t) => classifyTransaction(t) === 'cashback'),
    transfersOut: tally((t) => t.type === 'TRANSFER' && t.flow === 'OUT'),
    transfersIn: tally((t) => t.type === 'TRANSFER' && t.flow === 'IN'),
  };
}

/** Months (ascending) that have data up to and including `month`. */
export function monthsWithDataUpTo(txs: readonly AnalyticsTransaction[], month: string): string[] {
  return [...new Set(txs.map((t) => monthKeyOf(t.date)))].filter((m) => m <= month).sort();
}
