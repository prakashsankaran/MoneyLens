import { addMonths, formatINR, formatMonthKey, percentOf } from '@moneylens/shared';
import type {
  AnalyticsTransaction,
  CategoryRef,
  MonthlyReport,
  RecurringSeries,
  ReportStatement,
} from '@moneylens/types';
import { classifyTransaction } from './classify';
import { healthScore } from './health';
import { generateInsights } from './insights';
import { findSavingOpportunities } from './leakage';
import { brief, categoryComparisons } from './patterns';
import { groupByMonth, summarizePeriod, topMerchants } from './summary';

export interface ReportInput {
  month: string;
  /** Month to compare with; defaults to the previous month. */
  compareMonth?: string;
  /** Up to 12 months ending with `month`, plus `compareMonth` if older. */
  txs: readonly AnalyticsTransaction[];
  categories: readonly CategoryRef[];
  recurring: readonly RecurringSeries[];
  availableMonths: string[];
}

const pctText = (pct: number | null) =>
  pct === null ? '' : ` (${pct >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(pct))}%)`;

/**
 * A month's full report. Every figure comes from the analytics engine; the
 * summary sentences are templates filled with those figures, each labelled
 * with what kind of statement it is.
 */
export function monthlyReport(input: ReportInput): MonthlyReport {
  const { month, categories } = input;
  const compareMonth = input.compareMonth ?? addMonths(month, -1);
  const byMonth = groupByMonth(input.txs);
  const current = byMonth.get(month) ?? [];
  const before = byMonth.get(compareMonth) ?? [];
  const totals = summarizePeriod(current);
  const compareTotals = before.length ? summarizePeriod(before) : null;
  const label = formatMonthKey(month);
  const compareLabel = formatMonthKey(compareMonth);

  const { insights } = generateInsights(input);
  const savingOpportunities = findSavingOpportunities(input);
  const health = healthScore(input);
  const categoryRows = categoryComparisons(input.txs, month, categories, compareMonth);

  const summary: ReportStatement[] = [
    {
      kind: 'CALCULATION',
      text: `In ${label} you received ${formatINR(totals.incomePaise)} and spent ${formatINR(totals.spendingPaise)}.`,
    },
    {
      kind: 'CALCULATION',
      text:
        totals.savedPaise >= 0
          ? `You kept ${formatINR(totals.savedPaise)}` +
            (totals.savingsRatePct === null ? '.' : `, ${totals.savingsRatePct}% of your income.`)
          : `You spent ${formatINR(-totals.savedPaise)} more than you received.`,
    },
  ];
  if (compareTotals) {
    summary.push({
      kind: 'CALCULATION',
      text:
        `Compared with ${compareLabel}, spending was ${formatINR(totals.spendingPaise)} against ` +
        `${formatINR(compareTotals.spendingPaise)}` +
        pctText(
          compareTotals.spendingPaise
            ? percentOf(
                totals.spendingPaise - compareTotals.spendingPaise,
                compareTotals.spendingPaise,
              )
            : null,
        ) +
        '.',
    });
  }
  const topCategory = categoryRows[0];
  if (topCategory && topCategory.currentPaise > 0) {
    summary.push({
      kind: 'CALCULATION',
      text: `${topCategory.name} was your largest category at ${formatINR(topCategory.currentPaise)}.`,
    });
  }
  const biggestRise = [...categoryRows]
    .filter((r) => r.previousPaise > 0 && r.currentPaise - r.previousPaise >= 100_000)
    .sort((a, b) => b.currentPaise - b.previousPaise - (a.currentPaise - a.previousPaise))[0];
  if (biggestRise) {
    summary.push({
      kind: 'OBSERVATION',
      text: `${biggestRise.name} rose the most, by ${formatINR(biggestRise.currentPaise - biggestRise.previousPaise)} from ${compareLabel}.`,
    });
  }
  if (savingOpportunities[0]) {
    summary.push({ kind: 'OBSERVATION', text: savingOpportunities[0].title + '.' });
  }

  const previousByMerchant = new Map(
    topMerchants(before, 1000).map((m) => [m.merchantId ?? m.name, m.amountPaise]),
  );
  const recommendations: ReportStatement[] = [];
  const seen = new Set<string>();
  for (const i of [...savingOpportunities, ...insights]) {
    if (!i.recommendation || seen.has(i.recommendation)) continue;
    seen.add(i.recommendation);
    recommendations.push({ kind: 'RECOMMENDATION', text: i.recommendation });
    if (recommendations.length >= 5) break;
  }

  return {
    month,
    availableMonths: input.availableMonths,
    compareMonth: before.length ? compareMonth : null,
    executiveSummary: summary,
    totals,
    compareTotals,
    incomeSources: topMerchants(current, 5, 'income'),
    categories: categoryRows,
    merchants: topMerchants(current, 10).map((m) => ({
      ...m,
      previousAmountPaise: previousByMerchant.get(m.merchantId ?? m.name) ?? 0,
    })),
    recurring: input.recurring.filter((r) => r.active),
    biggestTransactions: current
      .filter((t) => classifyTransaction(t) === 'spend')
      .sort((a, b) => b.amountPaise - a.amountPaise)
      .slice(0, 5)
      .map(brief),
    changes: insights.filter((i) => i.group === 'spending'),
    behaviour: insights.filter((i) => i.group === 'behaviour' || i.group === 'anomalies'),
    savingOpportunities,
    recommendations,
    health,
  };
}
