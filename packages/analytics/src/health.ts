import { formatINR, monthsEnding, percentOf } from '@moneylens/shared';
import type {
  AnalyticsTransaction,
  CategoryRef,
  HealthComponent,
  HealthScore,
  RecurringSeries,
} from '@moneylens/types';
import { classifyTransaction } from './classify';
import { budgetStatus, type BudgetInput } from './budgets';
import { isDiscretionary } from './leakage';
import { mean } from './stats';
import { groupByMonth, summarizePeriod } from './summary';

/**
 * An explainable financial health score. Each component turns one measured
 * number into 0–100 with a straight line between two stated limits, and the
 * overall score is the weighted average of the components that could be
 * measured. Nothing is hidden: every component returns its input, formula
 * and weight, and missing components say why.
 */

export const HEALTH_WEIGHTS: Record<HealthComponent['key'], number> = {
  savings: 0.25,
  discretionary: 0.2,
  cashflow: 0.15,
  stability: 0.15,
  obligations: 0.15,
  budget: 0.1,
};

/** Recurring payments in these subcategories are saving, not obligations. */
const SAVING_SLUGS = new Set(['sip', 'investment', 'savings']);

/** Straight line from `zeroAt` (score 0) to `fullAt` (score 100), clamped. */
export function linearScore(value: number, zeroAt: number, fullAt: number): number {
  const t = (value - zeroAt) / (fullAt - zeroAt);
  return Math.round(Math.max(0, Math.min(1, t)) * 100);
}

export interface HealthInput {
  month: string;
  /** Up to 6 months ending with `month`. */
  txs: readonly AnalyticsTransaction[];
  categories: readonly CategoryRef[];
  recurring: readonly RecurringSeries[];
  /** Budgets set for `month`, if any. */
  budgets?: readonly BudgetInput[];
  /** "Today", for judging a month in progress. */
  now?: Date;
}

export function healthScore(input: HealthInput): HealthScore {
  const byMonth = groupByMonth(input.txs);
  const months = monthsEnding(input.month, 6).filter((m) => (byMonth.get(m) ?? []).length > 0);
  const totals = months.map((m) => ({ month: m, ...summarizePeriod(byMonth.get(m) ?? []) }));
  const recent = totals.filter((t) => monthsEnding(input.month, 3).includes(t.month));
  const byId = new Map(input.categories.map((c) => [c.id, c]));
  const components: HealthComponent[] = [];

  const unavailable = (
    key: HealthComponent['key'],
    label: string,
    formula: string,
    reason: string,
  ): HealthComponent => ({
    key,
    label,
    weight: HEALTH_WEIGHTS[key],
    score: null,
    measured: null,
    formula,
    unavailableReason: reason,
  });

  // Savings behaviour: average savings rate over the last 3 months with income.
  {
    const withIncome = recent.filter((t) => t.incomePaise > 0);
    const formula =
      'Savings rate (income minus spending, as % of income), averaged over up to 3 months. 0% or less scores 0; 20% or more scores 100.';
    if (withIncome.length === 0) {
      components.push(
        unavailable(
          'savings',
          'Savings behaviour',
          formula,
          'No income recorded in the last 3 months.',
        ),
      );
    } else {
      const income = withIncome.reduce((a, t) => a + t.incomePaise, 0);
      const saved = withIncome.reduce((a, t) => a + t.savedPaise, 0);
      const rate = percentOf(saved, income) ?? 0;
      components.push({
        key: 'savings',
        label: 'Savings behaviour',
        weight: HEALTH_WEIGHTS.savings,
        score: linearScore(rate, 0, 20),
        measured: `${rate.toFixed(1)}% of income saved (${formatINR(saved)} of ${formatINR(income)}, ${withIncome.length} ${withIncome.length === 1 ? 'month' : 'months'})`,
        formula,
        unavailableReason: null,
      });
    }
  }

  // Discretionary spending share this month.
  {
    const formula =
      "Share of this month's spending on dining, delivery, shopping, cabs and entertainment. 25% or less scores 100; 60% or more scores 0.";
    const current = byMonth.get(input.month) ?? [];
    const spend = current.filter((t) => classifyTransaction(t) === 'spend');
    const all = spend.reduce((a, t) => a + t.amountPaise, 0);
    if (all === 0) {
      components.push(
        unavailable('discretionary', 'Discretionary spending', formula, 'No spending this month.'),
      );
    } else {
      const disc = spend
        .filter((t) => isDiscretionary(t.categoryId, byId))
        .reduce((a, t) => a + t.amountPaise, 0);
      const share = percentOf(disc, all) ?? 0;
      components.push({
        key: 'discretionary',
        label: 'Discretionary spending',
        weight: HEALTH_WEIGHTS.discretionary,
        score: linearScore(share, 60, 25),
        measured: `${share.toFixed(1)}% of spending (${formatINR(disc)} of ${formatINR(all)})`,
        formula,
        unavailableReason: null,
      });
    }
  }

  // Cash-flow stability: months where income covered spending.
  {
    const formula =
      'Share of months (up to 6) in which income was at least spending. Every month covered scores 100.';
    if (totals.length < 3) {
      components.push(
        unavailable('cashflow', 'Cash-flow stability', formula, 'Needs at least 3 months of data.'),
      );
    } else {
      const covered = totals.filter((t) => t.incomePaise >= t.spendingPaise).length;
      components.push({
        key: 'cashflow',
        label: 'Cash-flow stability',
        weight: HEALTH_WEIGHTS.cashflow,
        score: Math.round((covered / totals.length) * 100),
        measured: `Income covered spending in ${covered} of ${totals.length} months`,
        formula,
        unavailableReason: null,
      });
    }
  }

  // Expense stability: how much monthly spending moves around.
  {
    const formula =
      'Coefficient of variation of monthly spending over up to 6 months. 0.05 or less scores 100; 0.50 or more scores 0.';
    if (totals.length < 3) {
      components.push(
        unavailable('stability', 'Expense stability', formula, 'Needs at least 3 months of data.'),
      );
    } else {
      const values = totals.map((t) => t.spendingPaise);
      const avg = mean(values);
      const sd = Math.sqrt(values.reduce((a, v) => a + (v - avg) ** 2, 0) / values.length);
      const cv = avg > 0 ? sd / avg : 0;
      components.push({
        key: 'stability',
        label: 'Expense stability',
        weight: HEALTH_WEIGHTS.stability,
        score: linearScore(cv, 0.5, 0.05),
        measured: `Monthly spending varies by ${(cv * 100).toFixed(0)}% (coefficient of variation ${cv.toFixed(2)})`,
        formula,
        unavailableReason: null,
      });
    }
  }

  // Recurring obligations against income.
  {
    const formula =
      'Monthly cost of active recurring payments as % of average monthly income. 30% or less scores 100; 70% or more scores 0.';
    const withIncome = recent.filter((t) => t.incomePaise > 0);
    if (withIncome.length === 0) {
      components.push(
        unavailable(
          'obligations',
          'Recurring obligations',
          formula,
          'No income recorded in the last 3 months.',
        ),
      );
    } else {
      const income = mean(withIncome.map((t) => t.incomePaise));
      // Investments and savings transfers are good commitments, so they are left out.
      const fixed = input.recurring
        .filter(
          (r) =>
            r.flow === 'OUT' &&
            r.active &&
            !SAVING_SLUGS.has(byId.get(r.categoryId ?? '')?.slug ?? ''),
        )
        .reduce((a, r) => a + r.monthlyEquivalentPaise, 0);
      const share = percentOf(fixed, income) ?? 0;
      components.push({
        key: 'obligations',
        label: 'Recurring obligations',
        weight: HEALTH_WEIGHTS.obligations,
        score: linearScore(share, 70, 30),
        measured: `${share.toFixed(1)}% of income (${formatINR(fixed)} a month of ${formatINR(income)})`,
        formula,
        unavailableReason: null,
      });
    }
  }

  // Budget adherence: share of this month's budgets kept so far.
  {
    const formula =
      "Share of this month's budgets where spending stayed within the amount (so far, for the month in progress). Half or fewer kept scores 0; all kept scores 100.";
    const budgets = input.budgets ?? [];
    if (budgets.length === 0) {
      components.push(
        unavailable('budget', 'Budget adherence', formula, 'No budgets set for this month.'),
      );
    } else {
      const status = budgetStatus(
        budgets,
        byMonth.get(input.month) ?? [],
        input.categories,
        input.month,
        input.now ?? new Date(),
      );
      const kept = status.items.filter((i) => i.status !== 'over').length;
      const total = status.items.length;
      const pct = total ? (kept / total) * 100 : 0;
      components.push({
        key: 'budget',
        label: 'Budget adherence',
        weight: HEALTH_WEIGHTS.budget,
        score: total ? linearScore(pct, 50, 100) : null,
        measured: total ? `${kept} of ${total} ${total === 1 ? 'budget' : 'budgets'} kept` : null,
        formula,
        unavailableReason: total ? null : 'No budgets set for this month.',
      });
    }
  }

  const scored = components.filter((c) => c.score !== null && c.weight > 0);
  const weight = scored.reduce((a, c) => a + c.weight, 0);
  const score =
    weight >= 0.5
      ? Math.round(scored.reduce((a, c) => a + (c.score as number) * c.weight, 0) / weight)
      : null;

  return {
    month: input.month,
    score,
    components,
    method:
      'Each component converts one measured number into 0–100 along a straight line between the limits shown. ' +
      'The score is the weighted average of the components that could be measured, with weights rescaled to add up to 1. ' +
      'It needs components worth at least half the total weight; otherwise no score is shown.',
    monthsUsed: months,
  };
}
