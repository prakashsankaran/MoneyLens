import {
  addDays,
  dayKeyOf,
  daysInRange,
  isWholeMonthRange,
  monthDayRange,
  monthKeyOf,
  monthsInRange,
  percentOf,
} from '@moneylens/shared';
import type {
  AnalyticsTransaction,
  CategoryBreakdownItem,
  CategoryRef,
  PeriodAnalytics,
  PeriodCategoryChange,
  PeriodCompare,
} from '@moneylens/types';
import { classifyTransaction } from './classify';
import { brief, weekdaySpending } from './patterns';
import { mean } from './stats';
import {
  categoryBreakdown,
  groupByMonth,
  monthlyTrend,
  summarizePeriod,
  topMerchants,
} from './summary';

/** Categories shown by name in the month-by-month chart; the rest are summed. */
const TREND_CATEGORIES = 5;
const OTHER_KEY = 'other';

export interface PeriodInput {
  from: string;
  to: string;
  previous: { from: string; to: string; compare: PeriodCompare };
  /** Transactions covering both the period and the one it is compared with. */
  txs: readonly AnalyticsTransaction[];
  categories: readonly CategoryRef[];
  availableMonths: string[];
}

function change(now: number, before: number): number | null {
  return before === 0 ? null : percentOf(now - before, before);
}

/** Every day key from `from` to `to`, both included. */
function dayKeys(from: string, to: string): string[] {
  return Array.from({ length: daysInRange(from, to) }, (_, i) => addDays(from, i));
}

/** Days of `month` that fall inside the range. */
function daysOfMonthInRange(month: string, from: string, to: string): number {
  const m = monthDayRange(month);
  const start = m.from > from ? m.from : from;
  const end = m.to < to ? m.to : to;
  return start > end ? 0 : daysInRange(start, end);
}

const keyOf = (c: { categoryId: string | null }) => c.categoryId ?? 'uncategorized';

/**
 * A detailed look at any stretch of time: totals and how they compare with
 * the period before, monthly averages, the month-by-month trend overall and
 * per category, the categories that moved most, merchants, income sources and
 * when the money was spent. Averages only count months that have data, so a
 * 12-month view over 4 months of imports is not diluted by empty months.
 */
export function periodAnalysis(input: PeriodInput): PeriodAnalytics {
  const { from, to, previous, categories } = input;
  const inRange = (key: string, a: string, b: string) => key >= a && key <= b;
  const current = input.txs.filter((t) => inRange(dayKeyOf(t.date), from, to));
  const before = input.txs.filter((t) => inRange(dayKeyOf(t.date), previous.from, previous.to));

  const months = monthsInRange(from, to);
  const byMonth = groupByMonth(current);
  const dataMonths = months.filter((m) => (byMonth.get(m) ?? []).length > 0);

  const totals = summarizePeriod(current);
  const hasPrevious = before.length > 0;
  const previousTotals = hasPrevious ? summarizePeriod(before) : null;

  // Months of data, counting a partly covered edge month as a fraction.
  const coveredDays = dataMonths.reduce((a, m) => a + daysOfMonthInRange(m, from, to), 0);
  const monthEquivalents = dataMonths.reduce(
    (a, m) => a + daysOfMonthInRange(m, from, to) / daysInRange(...monthBounds(m)),
    0,
  );
  const perMonth = (paise: number) =>
    monthEquivalents === 0 ? 0 : Math.round(paise / monthEquivalents);

  const trend = monthlyTrend(current, months);
  const withData = trend.filter((p) => dataMonths.includes(p.month));
  const bySpend = [...withData].sort((a, b) => b.spendingPaise - a.spendingPaise);

  const categoryRows = categoryBreakdown(current, categories, 'top');
  const subcategories: Record<string, CategoryBreakdownItem[]> = {};
  const byId = new Map(categories.map((c) => [c.id, c]));
  for (const row of categoryRows) {
    if (!row.categoryId) continue;
    const ids = new Set([row.categoryId]);
    for (const c of categories) if (isUnder(c, row.categoryId, byId)) ids.add(c.id);
    subcategories[row.categoryId] = categoryBreakdown(
      current.filter((t) => t.categoryId !== null && ids.has(t.categoryId)),
      categories,
      'leaf',
    );
  }

  return {
    from,
    to,
    days: daysInRange(from, to),
    wholeMonths: isWholeMonthRange(from, to),
    availableMonths: input.availableMonths,
    months,
    monthsWithData: dataMonths.length,
    totals,
    previous: {
      ...previous,
      hasData: hasPrevious,
      months: monthsInRange(previous.from, previous.to).length,
      monthsWithData: new Set(before.map((t) => monthKeyOf(t.date))).size,
    },
    previousTotals,
    incomeChangePct: previousTotals ? change(totals.incomePaise, previousTotals.incomePaise) : null,
    spendingChangePct: previousTotals
      ? change(totals.spendingPaise, previousTotals.spendingPaise)
      : null,
    savedChangePaise: previousTotals ? totals.savedPaise - previousTotals.savedPaise : null,
    averages: {
      monthlyIncomePaise: perMonth(totals.incomePaise),
      monthlySpendingPaise: perMonth(totals.spendingPaise),
      monthlySavedPaise: perMonth(totals.savedPaise),
      dailySpendingPaise: coveredDays === 0 ? 0 : Math.round(totals.spendingPaise / coveredDays),
    },
    trend,
    highestMonth: bySpend[0] ?? null,
    lowestMonth: bySpend.length > 1 ? (bySpend.at(-1) ?? null) : null,
    categories: categoryRows,
    subcategories,
    categoryTrend: categoryTrend(categoryRows, byMonth, months, categories),
    categoryChanges: hasPrevious
      ? categoryChanges(categoryRows, categoryBreakdown(before, categories, 'top'))
      : [],
    merchants: topMerchants(current, 10),
    incomeSources: topMerchants(current, 5, 'income'),
    patterns: patternsOf(current, from, to, months, byMonth),
  };
}

function monthBounds(month: string): [string, string] {
  const { from, to } = monthDayRange(month);
  return [from, to];
}

function isUnder(c: CategoryRef, ancestorId: string, byId: ReadonlyMap<string, CategoryRef>) {
  let current: CategoryRef | undefined = c;
  for (let depth = 0; current?.parentId && depth < 10; depth++) {
    if (current.parentId === ancestorId) return true;
    current = byId.get(current.parentId);
  }
  return false;
}

/** The top categories month by month, with everything else in one series. */
function categoryTrend(
  rows: readonly CategoryBreakdownItem[],
  byMonth: Map<string, AnalyticsTransaction[]>,
  months: readonly string[],
  categories: readonly CategoryRef[],
): PeriodAnalytics['categoryTrend'] {
  const named = rows.slice(0, TREND_CATEGORIES);
  const series = named.map((r) => ({ key: keyOf(r), categoryId: r.categoryId, name: r.name }));
  if (rows.length > TREND_CATEGORIES) {
    series.push({ key: OTHER_KEY, categoryId: null, name: 'Everything else' });
  }
  const namedKeys = new Set(named.map(keyOf));
  const points = months.map((month) => {
    const values: Record<string, number> = Object.fromEntries(series.map((s) => [s.key, 0]));
    for (const r of categoryBreakdown(byMonth.get(month) ?? [], categories, 'top')) {
      const key = namedKeys.has(keyOf(r)) ? keyOf(r) : OTHER_KEY;
      if (key in values) values[key] = (values[key] ?? 0) + r.amountPaise;
    }
    return { month, values };
  });
  return { series, points };
}

/** Categories by how much they moved, in rupees, against the previous period. */
function categoryChanges(
  now: readonly CategoryBreakdownItem[],
  before: readonly CategoryBreakdownItem[],
): PeriodCategoryChange[] {
  const rows = new Map<string, PeriodCategoryChange>();
  for (const r of now) {
    rows.set(keyOf(r), {
      categoryId: r.categoryId,
      name: r.name,
      slug: r.slug,
      currentPaise: r.amountPaise,
      previousPaise: 0,
      changePaise: r.amountPaise,
      changePct: null,
    });
  }
  for (const r of before) {
    const row = rows.get(keyOf(r)) ?? {
      categoryId: r.categoryId,
      name: r.name,
      slug: r.slug,
      currentPaise: 0,
      previousPaise: 0,
      changePaise: 0,
      changePct: null,
    };
    row.previousPaise = r.amountPaise;
    row.changePaise = row.currentPaise - r.amountPaise;
    row.changePct = change(row.currentPaise, r.amountPaise);
    rows.set(keyOf(r), row);
  }
  return [...rows.values()]
    .filter((r) => r.changePaise !== 0)
    .sort(
      (a, b) => Math.abs(b.changePaise) - Math.abs(a.changePaise) || a.name.localeCompare(b.name),
    )
    .slice(0, 6);
}

function patternsOf(
  current: readonly AnalyticsTransaction[],
  from: string,
  to: string,
  months: readonly string[],
  byMonth: Map<string, AnalyticsTransaction[]>,
): PeriodAnalytics['patterns'] {
  const spend = current.filter((t) => classifyTransaction(t) === 'spend');
  const { byWeekday, weekdayAvg, weekendAvg } = weekdaySpending(spend, dayKeys(from, to));

  // Volatility only over whole months inside the range that have data.
  const fullMonths = months.filter((m) => {
    const [a, b] = monthBounds(m);
    return a >= from && b <= to && (byMonth.get(m) ?? []).length > 0;
  });
  const monthly = fullMonths.map((m) => summarizePeriod(byMonth.get(m) ?? []).spendingPaise);
  const avg = mean(monthly);
  const sd =
    monthly.length > 1
      ? Math.sqrt(monthly.reduce((a, v) => a + (v - avg) ** 2, 0) / monthly.length)
      : 0;

  const tally = (pred: (t: AnalyticsTransaction) => boolean) => {
    const list = current.filter(pred);
    return { count: list.length, amountPaise: list.reduce((a, t) => a + t.amountPaise, 0) };
  };

  return {
    byWeekday,
    weekdayDailyAveragePaise: weekdayAvg,
    weekendDailyAveragePaise: weekendAvg,
    weekendRatio: weekdayAvg === 0 ? null : Math.round((weekendAvg / weekdayAvg) * 100) / 100,
    monthlyVolatility: monthly.length >= 3 && avg > 0 ? Math.round((sd / avg) * 100) / 100 : null,
    largest: [...spend]
      .sort((a, b) => b.amountPaise - a.amountPaise)
      .slice(0, 8)
      .map(brief),
    refunds: tally((t) => classifyTransaction(t) === 'refund'),
    cashback: tally((t) => classifyTransaction(t) === 'cashback'),
    transfersOut: tally((t) => t.type === 'TRANSFER' && t.flow === 'OUT'),
    transfersIn: tally((t) => t.type === 'TRANSFER' && t.flow === 'IN'),
  };
}
