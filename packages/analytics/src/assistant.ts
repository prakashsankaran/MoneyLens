import { addMonths, formatMonthKey, monthKeyOf, monthsEnding, percentOf } from '@moneylens/shared';
import type {
  AssistantCategoryChange,
  AssistantContext,
  CategoryComparisonRow,
  MoneyPlanResult,
  SpendingDriver,
} from '@moneylens/types';
import { healthScore } from './health';
import { generateInsights, type InsightInput } from './insights';
import { findSavingOpportunities } from './leakage';
import { categoryComparisons, periodComparisons, spendingPatterns } from './patterns';
import {
  categoryBreakdown,
  groupByMonth,
  monthlyTrend,
  summarizePeriod,
  topMerchants,
} from './summary';

/** Months of trend given to the assistant. */
export const ASSISTANT_TREND_MONTHS = 6;
/** A change in payment count or average size smaller than this is "no real change". */
export const DRIVER_THRESHOLD_PCT = 10;

export interface AssistantInput extends InsightInput {
  /** Months with confirmed transactions, oldest first. */
  availableMonths: readonly string[];
  /** The saved money plan, if any. */
  plan?: MoneyPlanResult | null;
}

const change = (now: number, before: number) =>
  before === 0 ? null : percentOf(now - before, before);

/**
 * Whether a category moved because of more (or fewer) payments or bigger
 * (or smaller) ones. Both measures must move by at least DRIVER_THRESHOLD_PCT
 * to count; when both do and neither is less than half the other, it is both.
 */
export function spendingDriver(
  countChangePct: number | null,
  averageChangePct: number | null,
): SpendingDriver | null {
  if (countChangePct === null || averageChangePct === null) return null;
  const f = Math.abs(countChangePct);
  const s = Math.abs(averageChangePct);
  if (f < DRIVER_THRESHOLD_PCT && s < DRIVER_THRESHOLD_PCT) return 'neither';
  if (
    f >= DRIVER_THRESHOLD_PCT &&
    s >= DRIVER_THRESHOLD_PCT &&
    Math.min(f, s) / Math.max(f, s) >= 0.5
  )
    return 'both';
  return f > s ? 'frequency' : 'size';
}

function toChange(row: CategoryComparisonRow, topLevel: boolean): AssistantCategoryChange {
  const currentAveragePaise = row.currentCount
    ? Math.round(row.currentPaise / row.currentCount)
    : 0;
  const previousAveragePaise = row.previousCount
    ? Math.round(row.previousPaise / row.previousCount)
    : 0;
  const countChangePct = row.previousCount ? change(row.currentCount, row.previousCount) : null;
  const averageChangePct = previousAveragePaise
    ? change(currentAveragePaise, previousAveragePaise)
    : null;
  return {
    categoryId: row.categoryId,
    name: row.name,
    slug: row.slug,
    topLevel,
    currentPaise: row.currentPaise,
    previousPaise: row.previousPaise,
    average3Paise: Math.round(row.average3Paise),
    changePaise: row.currentPaise - row.previousPaise,
    changeVsPreviousPct: row.changeVsPreviousPct,
    changeVsAverage3Paise: row.currentPaise - Math.round(row.average3Paise),
    changeVsAverage3Pct: row.changeVsAverage3Pct,
    currentCount: row.currentCount,
    previousCount: row.previousCount,
    currentAveragePaise,
    previousAveragePaise,
    countChangePct,
    averageChangePct,
    driver: spendingDriver(countChangePct, averageChangePct),
  };
}

/**
 * Everything MoneyLens AI may say about `month`, calculated here so the model
 * never has to add, subtract or divide. Amounts stay in paise; the API formats
 * them. Nothing in the result identifies an account, UPI ID or reference.
 */
export function assistantContext(input: AssistantInput): AssistantContext {
  const { month, txs, categories } = input;
  const now = input.now ?? new Date();
  const byMonth = groupByMonth(txs);
  const previousMonth = addMonths(month, -1);
  const current = byMonth.get(month) ?? [];
  const previous = byMonth.get(previousMonth) ?? [];
  const totals = summarizePeriod(current);
  const previousTotals = previous.length ? summarizePeriod(previous) : null;
  const monthsAvailable = input.availableMonths.filter((m) => m <= month);
  const earlier = monthsAvailable.filter((m) => m < month);
  const monthInProgress = month === monthKeyOf(now);

  // Top-level categories, plus subcategories that have their own spending.
  const topRows = categoryComparisons(txs, month, categories);
  const leafRows = categoryComparisons(txs, month, categories, previousMonth, 'leaf').filter(
    (r) => categories.find((c) => c.id === r.categoryId)?.parentId,
  );
  const categoryChanges = [
    ...topRows.map((r) => toChange(r, true)),
    ...leafRows.map((r) => toChange(r, false)),
  ];

  const opportunities = findSavingOpportunities(input)
    .filter((o) => (o.potentialMonthlySavingPaise ?? 0) > 0)
    .sort((a, b) => (b.potentialMonthlySavingPaise ?? 0) - (a.potentialMonthlySavingPaise ?? 0));
  let running = 0;
  const savingOpportunities = opportunities.map((o) => {
    running += o.potentialMonthlySavingPaise ?? 0;
    return {
      title: o.title,
      potentialMonthlySavingPaise: o.potentialMonthlySavingPaise ?? 0,
      cumulativeMonthlySavingPaise: running,
      assumption: o.assumption ?? null,
    };
  });

  const recurring = input.recurring
    .filter((r) => r.flow === 'OUT' && r.active)
    .sort((a, b) => b.monthlyEquivalentPaise - a.monthlyEquivalentPaise);
  const health = healthScore(input);
  const patterns = spendingPatterns(txs, month);
  const { insights } = generateInsights(input);

  const dataLimitations: string[] = [];
  const label = formatMonthKey(month);
  if (current.length === 0) {
    dataLimitations.push(`There are no confirmed transactions for ${label}.`);
  }
  if (earlier.length === 0) {
    dataLimitations.push(
      `I only have transaction data for ${label}, so I cannot compare it with earlier months or judge a long-term trend.`,
    );
  } else if (earlier.length < 3) {
    dataLimitations.push(
      `There ${earlier.length === 1 ? 'is only 1 earlier month' : `are only ${earlier.length} earlier months`} of data, so averages and trends are less reliable.`,
    );
  }
  if (monthInProgress) {
    dataLimitations.push(`${label} is still in progress, so its totals are not final.`);
  }

  return {
    month,
    monthsAvailable,
    monthInProgress,
    totals,
    previousMonth,
    previousTotals,
    spendingChangePaise: previousTotals
      ? totals.spendingPaise - previousTotals.spendingPaise
      : null,
    spendingChangePct: previousTotals
      ? change(totals.spendingPaise, previousTotals.spendingPaise)
      : null,
    incomeChangePct: previousTotals ? change(totals.incomePaise, previousTotals.incomePaise) : null,
    comparisons: periodComparisons(txs, month).filter((r) => r.baselineMonths > 0),
    categories: categoryBreakdown(current, categories),
    categoryChanges,
    topMerchants: topMerchants(current, 5),
    trend: monthlyTrend(txs, monthsEnding(month, ASSISTANT_TREND_MONTHS)).filter((p) =>
      monthsAvailable.includes(p.month),
    ),
    recurring: recurring.map((r) => ({
      label: r.label,
      frequency: r.frequency,
      typicalAmountPaise: r.typicalAmountPaise,
      monthlyEquivalentPaise: r.monthlyEquivalentPaise,
      annualEquivalentPaise: r.annualEquivalentPaise,
      subscriptionLike: r.subscriptionLike,
      nextExpectedDate: r.nextExpectedDate,
    })),
    recurringMonthlyPaise: recurring.reduce((a, r) => a + r.monthlyEquivalentPaise, 0),
    recurringAnnualPaise: recurring.reduce((a, r) => a + r.annualEquivalentPaise, 0),
    savingOpportunities,
    savingOpportunitiesTotalPaise: running,
    insights: insights.map((i) => ({ group: i.group, title: i.title, explanation: i.explanation })),
    health: {
      score: health.score,
      components: health.components.map((c) => ({
        label: c.label,
        score: c.score,
        measured: c.measured,
      })),
    },
    patterns: {
      weekdayDailyAveragePaise: patterns.weekdayDailyAveragePaise,
      weekendDailyAveragePaise: patterns.weekendDailyAveragePaise,
      weekendRatio: patterns.weekendRatio,
      largest: patterns.largest.slice(0, 5).map((t) => ({
        date: t.date,
        merchantName: t.merchantName,
        amountPaise: t.amountPaise,
      })),
    },
    plan: input.plan?.ready
      ? {
          status: input.plan.status,
          surplusPaise: input.plan.surplusPaise,
          afterGoalsPaise: input.plan.afterGoalsPaise,
        }
      : null,
    dataLimitations,
  };
}
