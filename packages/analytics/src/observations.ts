import { formatINR, percentOf } from '@moneylens/shared';
import type { AnalyticsTransaction, CategoryRef, Observation, Severity } from '@moneylens/types';
import { classifyTransaction } from './classify';
import { categoryBreakdown, topLevelCategory, type CategoryLevel } from './summary';
import { mean } from './stats';

export interface CategoryAverageOptions {
  /** Minimum months of history needed before comparing. */
  minHistoryMonths?: number;
  /** Ignore differences smaller than this (paise). */
  minDifferencePaise?: number;
  /** Ignore differences smaller than this share of the average (percent). */
  minDifferencePct?: number;
}

/**
 * Categories whose spending this month is meaningfully above their average over
 * the previous months. Deterministic: the statement is a calculation over the
 * user's own data, so it is labelled OBSERVATION, not AI interpretation.
 *
 * Subcategories are checked first because they are more actionable ("Food
 * Delivery" rather than "Food"); a top-level category is only reported when
 * none of its subcategories already explains the increase.
 */
export function categoriesAboveAverage(
  current: readonly AnalyticsTransaction[],
  history: readonly (readonly AnalyticsTransaction[])[],
  categories: readonly CategoryRef[],
  opts: CategoryAverageOptions = {},
): Observation[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const leaf = compareWithAverage(current, history, categories, 'leaf', opts).filter(
    (o) => byId.get(o.categoryId)?.parentId,
  );
  const explainedParents = new Set(leaf.map((o) => byId.get(o.categoryId)?.parentId));
  const top = compareWithAverage(current, history, categories, 'top', opts).filter(
    (o) => !explainedParents.has(o.categoryId),
  );
  return [...leaf, ...top]
    .map((o) => o.observation)
    .sort((a, b) => (b.metric.valuePaise ?? 0) - (a.metric.valuePaise ?? 0));
}

function compareWithAverage(
  current: readonly AnalyticsTransaction[],
  history: readonly (readonly AnalyticsTransaction[])[],
  categories: readonly CategoryRef[],
  level: CategoryLevel,
  opts: CategoryAverageOptions,
): { categoryId: string; observation: Observation }[] {
  const { minHistoryMonths = 2, minDifferencePaise = 100_000, minDifferencePct = 15 } = opts;
  const monthsWithData = history.filter((m) => m.length > 0);
  if (monthsWithData.length < minHistoryMonths) return [];

  const historyBreakdowns = monthsWithData.map((m) => categoryBreakdown(m, categories, level));
  const byId = new Map(categories.map((c) => [c.id, c]));
  const results: { categoryId: string; observation: Observation }[] = [];

  for (const row of categoryBreakdown(current, categories, level)) {
    if (!row.categoryId) continue;
    const pastAmounts = historyBreakdowns.map(
      (b) => b.find((r) => r.categoryId === row.categoryId)?.amountPaise ?? 0,
    );
    // Only compare against categories with an established history; spending in
    // a category that is new this period is a different signal (Phase 4).
    if (pastAmounts.filter((a) => a > 0).length < minHistoryMonths) continue;
    const average = mean(pastAmounts);
    const difference = row.amountPaise - average;
    const differencePct = percentOf(difference, average);
    if (difference < minDifferencePaise) continue;
    if (differencePct !== null && differencePct < minDifferencePct) continue;

    const supporting = current
      .filter(
        (tx) =>
          classifyTransaction(tx) === 'spend' &&
          (level === 'top' ? topLevelCategory(tx.categoryId, byId)?.id : tx.categoryId) ===
            row.categoryId,
      )
      .map((tx) => tx.id);
    const n = monthsWithData.length;

    const categoryId = row.categoryId;
    results.push({
      categoryId,
      observation: {
        id: `category-above-average:${row.slug}`,
        kind: 'OBSERVATION',
        severity: severityFor(differencePct),
        title: `${row.name} is ${formatINR(difference)} above your ${n}-month average`,
        explanation:
          `You spent ${formatINR(row.amountPaise)} on ${row.name} this month, compared with an ` +
          `average of ${formatINR(average)} over the previous ${n} months` +
          (differencePct === null ? '.' : ` (${Math.round(differencePct)}% higher).`),
        metric: { label: `Above ${n}-month average`, valuePaise: difference },
        supportingTransactionIds: supporting,
      },
    });
  }

  return results;
}

export interface SmallTransactionOptions {
  /** A "small" transaction is strictly below this amount (paise). */
  thresholdPaise?: number;
  /** Only report when at least this many small transactions occurred. */
  minCount?: number;
}

/**
 * Many small purchases can add up unnoticed. Reports their count and total when
 * they are frequent enough to matter.
 */
export function smallTransactionAccumulation(
  current: readonly AnalyticsTransaction[],
  opts: SmallTransactionOptions = {},
): Observation[] {
  const { thresholdPaise = 30_000, minCount = 8 } = opts;
  const small = current.filter(
    (tx) => classifyTransaction(tx) === 'spend' && tx.amountPaise < thresholdPaise,
  );
  if (small.length < minCount) return [];
  const total = small.reduce((acc, tx) => acc + tx.amountPaise, 0);

  return [
    {
      id: 'small-transaction-accumulation',
      kind: 'OBSERVATION',
      severity: small.length >= minCount * 2 ? 'medium' : 'low',
      title: `${small.length} small transactions added up to ${formatINR(total)}`,
      explanation:
        `${small.length} payments under ${formatINR(thresholdPaise)} each were made this month. ` +
        `Individually small, together they total ${formatINR(total)}.`,
      metric: { label: `Spent in payments under ${formatINR(thresholdPaise)}`, valuePaise: total },
      supportingTransactionIds: small.map((tx) => tx.id),
    },
  ];
}

function severityFor(differencePct: number | null): Severity {
  if (differencePct === null || differencePct >= 50) return 'high';
  if (differencePct >= 25) return 'medium';
  return 'low';
}
