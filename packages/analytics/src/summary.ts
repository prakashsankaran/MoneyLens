import { monthKeyOf, percentOf } from '@moneylens/shared';
import type {
  AnalyticsTransaction,
  CategoryBreakdownItem,
  CategoryRef,
  MerchantSummaryItem,
  MonthlyTrendPoint,
  PeriodComparison,
  PeriodTotals,
} from '@moneylens/types';
import { classifyTransaction, type FlowClass } from './classify';
import { mean, median, sum } from './stats';

/** Totals for an arbitrary set of transactions (normally one month). */
export function summarizePeriod(txs: readonly AnalyticsTransaction[]): PeriodTotals {
  const spendAmounts: number[] = [];
  let income = 0;
  let refunds = 0;
  let cashback = 0;

  for (const tx of txs) {
    switch (classifyTransaction(tx)) {
      case 'spend':
        spendAmounts.push(tx.amountPaise);
        break;
      case 'income':
        income += tx.amountPaise;
        break;
      case 'refund':
        refunds += tx.amountPaise;
        break;
      case 'cashback':
        cashback += tx.amountPaise;
        break;
      case 'excluded':
        break;
    }
  }

  const grossSpending = sum(spendAmounts);
  const spending = grossSpending - refunds;
  const saved = income - spending;

  return {
    incomePaise: income,
    grossSpendingPaise: grossSpending,
    refundsPaise: refunds,
    spendingPaise: spending,
    cashbackPaise: cashback,
    savedPaise: saved,
    savingsRatePct: percentOf(saved, income),
    spendTransactionCount: spendAmounts.length,
    averageSpendPaise: mean(spendAmounts),
    medianSpendPaise: median(spendAmounts),
  };
}

const UNCATEGORIZED: Omit<CategoryBreakdownItem, 'amountPaise' | 'sharePct' | 'transactionCount'> =
  {
    categoryId: null,
    name: 'Uncategorized',
    slug: 'uncategorized',
    color: null,
  };

/** Resolve a (sub)category id to its top-level category. */
export function topLevelCategory(
  categoryId: string | null,
  byId: ReadonlyMap<string, CategoryRef>,
): CategoryRef | null {
  let current = categoryId ? byId.get(categoryId) : undefined;
  // Bounded walk guards against accidental cycles in user-defined categories.
  for (let depth = 0; current?.parentId && depth < 10; depth++) {
    const parent = byId.get(current.parentId);
    if (!parent) break;
    current = parent;
  }
  return current ?? null;
}

export type CategoryLevel = 'top' | 'leaf';

/**
 * Net spending per category (spend minus refunds in that category), largest
 * first. At the default 'top' level subcategories roll up to their parent; at
 * 'leaf' level each transaction stays in its most specific category.
 * Shares are of the summed category totals so they add to ~100%.
 */
export function categoryBreakdown(
  txs: readonly AnalyticsTransaction[],
  categories: readonly CategoryRef[],
  level: CategoryLevel = 'top',
): CategoryBreakdownItem[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const buckets = new Map<string, { ref: CategoryRef | null; amount: number; count: number }>();

  for (const tx of txs) {
    const kind = classifyTransaction(tx);
    if (kind !== 'spend' && kind !== 'refund') continue;
    const ref =
      level === 'top'
        ? topLevelCategory(tx.categoryId, byId)
        : ((tx.categoryId ? byId.get(tx.categoryId) : undefined) ?? null);
    const key = ref?.id ?? '__uncategorized__';
    const bucket = buckets.get(key) ?? { ref, amount: 0, count: 0 };
    if (kind === 'spend') {
      bucket.amount += tx.amountPaise;
      bucket.count += 1;
    } else {
      bucket.amount -= tx.amountPaise;
    }
    buckets.set(key, bucket);
  }

  const rows = [...buckets.values()]
    .map((b) => ({ ...b, amount: Math.max(b.amount, 0) }))
    .filter((b) => b.amount > 0);
  const total = sum(rows.map((r) => r.amount));

  return rows
    .map(({ ref, amount, count }): CategoryBreakdownItem => ({
      ...(ref
        ? { categoryId: ref.id, name: ref.name, slug: ref.slug, color: ref.color }
        : UNCATEGORIZED),
      amountPaise: amount,
      sharePct: percentOf(amount, total) ?? 0,
      transactionCount: count,
    }))
    .sort((a, b) => b.amountPaise - a.amountPaise || a.name.localeCompare(b.name));
}

/** Income, spending and savings for each requested month, in the given order. */
export function monthlyTrend(
  txs: readonly AnalyticsTransaction[],
  months: readonly string[],
): MonthlyTrendPoint[] {
  const byMonth = groupByMonth(txs);
  return months.map((month) => {
    const totals = summarizePeriod(byMonth.get(month) ?? []);
    return {
      month,
      incomePaise: totals.incomePaise,
      spendingPaise: totals.spendingPaise,
      savedPaise: totals.savedPaise,
    };
  });
}

export function groupByMonth(
  txs: readonly AnalyticsTransaction[],
): Map<string, AnalyticsTransaction[]> {
  const map = new Map<string, AnalyticsTransaction[]>();
  for (const tx of txs) {
    const key = monthKeyOf(tx.date);
    const list = map.get(key);
    if (list) list.push(tx);
    else map.set(key, [tx]);
  }
  return map;
}

/** Merchants ranked by gross spend (or by income, with `kind: 'income'`). */
export function topMerchants(
  txs: readonly AnalyticsTransaction[],
  limit = 5,
  kind: FlowClass = 'spend',
): MerchantSummaryItem[] {
  const buckets = new Map<string, MerchantSummaryItem>();
  for (const tx of txs) {
    if (classifyTransaction(tx) !== kind || !tx.merchantName) continue;
    const key = tx.merchantId ?? `name:${tx.merchantName.toLowerCase()}`;
    const bucket = buckets.get(key) ?? {
      merchantId: tx.merchantId,
      name: tx.merchantName,
      amountPaise: 0,
      transactionCount: 0,
    };
    bucket.amountPaise += tx.amountPaise;
    bucket.transactionCount += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .sort((a, b) => b.amountPaise - a.amountPaise || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Month-over-month change between two trend points. */
export function comparePeriods(
  current: MonthlyTrendPoint,
  previous: MonthlyTrendPoint,
): PeriodComparison {
  const change = (now: number, before: number) =>
    before === 0 ? null : percentOf(now - before, before);
  return {
    previousMonth: previous.month,
    incomeChangePct: change(current.incomePaise, previous.incomePaise),
    spendingChangePct: change(current.spendingPaise, previous.spendingPaise),
    savedChangePaise: current.savedPaise - previous.savedPaise,
  };
}
