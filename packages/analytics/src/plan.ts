import { formatINR, formatMonthKey, parseMonthKey, percentOf } from '@moneylens/shared';
import type {
  AnalyticsTransaction,
  CategoryRef,
  FinancialProfileData,
  MoneyPlanResult,
  ObservedBaseline,
  PlanLine,
  ReportStatement,
  SpendingKind,
  SuggestedBudget,
} from '@moneylens/types';
import { DISCRETIONARY_SLUGS } from './leakage';
import { mean } from './stats';
import { categoryBreakdown, groupByMonth, summarizePeriod } from './summary';

/**
 * The personal money plan: what the user entered, what their transactions
 * show, and the arithmetic that joins them. Everything is a calculation with
 * its source stated; the suggestions are educational, not financial advice.
 */

const COMMITMENT_SLUGS = new Set(['housing', 'rent', 'maintenance', 'emi', 'insurance']);
const INVESTING_SLUGS = new Set(['investment', 'sip', 'savings']);
const ESSENTIAL_SLUGS = new Set([
  'groceries',
  'household',
  'bills',
  'electricity',
  'water',
  'internet',
  'mobile',
  'transport',
  'fuel',
  'public-transport',
  'parking',
  'healthcare',
  'medicine',
  'hospital',
  'diagnostics',
]);
const LIFESTYLE_PARENTS = new Set(['shopping', 'entertainment']);

export const PLAN_DISCLAIMER =
  'Educational planning suggestion based on the figures you entered and your transactions. ' +
  'It is not professional financial advice.';

/** Months of history the planner averages. */
export const BASELINE_MONTHS = 3;

/** Planner treatment of a category, by its own slug first and then its parent's. */
export function spendingKind(
  categoryId: string | null,
  byId: ReadonlyMap<string, CategoryRef>,
): SpendingKind {
  const c = categoryId ? byId.get(categoryId) : undefined;
  if (!c) return 'other';
  const parent = c.parentId ? byId.get(c.parentId) : undefined;
  // The category's own slug decides first, so "Cab" under Transport is lifestyle.
  for (const slug of [c.slug, parent?.slug]) {
    if (!slug) continue;
    if (COMMITMENT_SLUGS.has(slug)) return 'commitment';
    if (INVESTING_SLUGS.has(slug)) return 'investing';
    if (ESSENTIAL_SLUGS.has(slug)) return 'essential';
    if (DISCRETIONARY_SLUGS.has(slug)) return 'lifestyle';
  }
  if (!c.parentId && LIFESTYLE_PARENTS.has(c.slug)) return 'lifestyle';
  // "Financial" without a subcategory is most often an EMI or a premium.
  if (c.slug === 'financial' || parent?.slug === 'financial') return 'commitment';
  return 'other';
}

/**
 * The baseline months: the latest `count` months with data before the
 * current (incomplete) month, or the latest months with data if there are
 * none before it.
 */
export function baselineMonths(
  monthsWithData: readonly string[],
  currentMonth: string,
  count = BASELINE_MONTHS,
): string[] {
  const complete = monthsWithData.filter((m) => m < currentMonth);
  return (complete.length ? complete : [...monthsWithData]).slice(-count);
}

/** Monthly averages over `months`, split by how the planner treats each category. */
export function observedBaseline(
  txs: readonly AnalyticsTransaction[],
  categories: readonly CategoryRef[],
  months: readonly string[],
): ObservedBaseline {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const byMonth = groupByMonth(txs);
  const monthTxs = months.map((m) => byMonth.get(m) ?? []);
  const n = months.length;

  const totals = new Map<
    string,
    { ref: Omit<ObservedBaseline['categories'][number], 'averagePaise'>; sum: number }
  >();
  for (const list of monthTxs) {
    for (const row of categoryBreakdown(list, categories, 'leaf')) {
      const key = row.categoryId ?? '__uncategorized__';
      const entry = totals.get(key) ?? {
        ref: {
          categoryId: row.categoryId,
          name: row.name,
          slug: row.slug,
          kind: spendingKind(row.categoryId, byId),
        },
        sum: 0,
      };
      entry.sum += row.amountPaise;
      totals.set(key, entry);
    }
  }
  const rows = [...totals.values()]
    .map(({ ref, sum }) => ({ ...ref, averagePaise: n ? Math.round(sum / n) : 0 }))
    .filter((r) => r.averagePaise > 0)
    .sort((a, b) => b.averagePaise - a.averagePaise || a.name.localeCompare(b.name));
  const of = (kind: SpendingKind) =>
    rows.filter((r) => r.kind === kind).reduce((a, r) => a + r.averagePaise, 0);

  return {
    months: [...months],
    incomePaise: n ? Math.round(mean(monthTxs.map((l) => summarizePeriod(l).incomePaise))) : 0,
    commitmentsPaise: of('commitment'),
    investingPaise: of('investing'),
    essentialPaise: of('essential'),
    lifestylePaise: of('lifestyle'),
    otherPaise: of('other'),
    spendingPaise: n ? Math.round(mean(monthTxs.map((l) => summarizePeriod(l).spendingPaise))) : 0,
    categories: rows,
  };
}

/** Whole months from `from` up to (but not including) `to`, at least 1. */
function monthsUntil(from: string, to: string): number {
  const a = parseMonthKey(from);
  const b = parseMonthKey(to);
  return Math.max(1, (b.year - a.year) * 12 + (b.month - a.month));
}

/** Round up to the next ₹100, for budgets people can remember. */
const roundUp100 = (paise: number) => Math.ceil(paise / 10_000) * 10_000;

export interface PlanInput {
  profile: FinancialProfileData | null;
  baseline: ObservedBaseline;
  /** "YYYY-MM" of today, for upcoming expenses. */
  currentMonth: string;
}

export function buildMoneyPlan({ profile, baseline, currentMonth }: PlanInput): MoneyPlanResult {
  const p = profile;
  const has = (v: number | null | undefined): v is number => v !== null && v !== undefined;
  const avgLabel = baseline.months.length
    ? `${baseline.months.length}-month average from your transactions`
    : 'no transactions yet';
  const suggestions: ReportStatement[] = [];
  const suggest = (text: string) => suggestions.push({ kind: 'RECOMMENDATION', text });
  // The suggestion about the plan's overall result goes first.
  const lead = (text: string) => suggestions.unshift({ kind: 'RECOMMENDATION', text });

  if (!p || !has(p.monthlyIncomePaise)) {
    return {
      ready: false,
      missing: ['monthlyIncome'],
      baseline,
      breakdown: [],
      surplusPaise: 0,
      goals: [],
      afterGoalsPaise: 0,
      status: 'incomplete',
      suggestions: baseline.incomePaise
        ? [
            {
              kind: 'RECOMMENDATION',
              text: `Enter your monthly income to build the plan. Your transactions show about ${formatINR(baseline.incomePaise)} a month coming in.`,
            },
          ]
        : [{ kind: 'RECOMMENDATION', text: 'Enter your monthly income to build the plan.' }],
      suggestedBudgets: [],
      disclaimer: PLAN_DISCLAIMER,
    };
  }

  const income = p.monthlyIncomePaise;
  const enteredCommitments = [p.fixedExpensesPaise, p.emisPaise, p.insurancePaise];
  const anyCommitment = enteredCommitments.some(has);
  const commitments = anyCommitment
    ? enteredCommitments.reduce<number>((a, v) => a + (v ?? 0), 0)
    : baseline.commitmentsPaise;
  const investments = has(p.investmentsPaise) ? p.investmentsPaise : baseline.investingPaise;

  const breakdown: PlanLine[] = [
    { key: 'income', label: 'Monthly income', amountPaise: income, source: 'ENTERED', note: null },
    {
      key: 'commitments',
      label: 'Fixed commitments (rent, EMIs, insurance)',
      amountPaise: commitments,
      source: anyCommitment ? 'ENTERED' : 'OBSERVED',
      note: anyCommitment ? null : `Not entered, so the ${avgLabel} is used.`,
    },
    {
      key: 'essential',
      label: 'Essential expenses (groceries, bills, transport, health)',
      amountPaise: baseline.essentialPaise,
      source: 'OBSERVED',
      note: avgLabel,
    },
    {
      key: 'lifestyle',
      label: 'Lifestyle expenses (dining, delivery, shopping, entertainment)',
      amountPaise: baseline.lifestylePaise,
      source: 'OBSERVED',
      note: avgLabel,
    },
    {
      key: 'other',
      label: 'Other spending (transfers, uncategorised)',
      amountPaise: baseline.otherPaise,
      source: 'OBSERVED',
      note: avgLabel,
    },
    {
      key: 'investments',
      label: 'Investments (SIPs and similar)',
      amountPaise: investments,
      source: has(p.investmentsPaise) ? 'ENTERED' : 'OBSERVED',
      note: has(p.investmentsPaise) ? null : `Not entered, so the ${avgLabel} is used.`,
    },
  ];
  const surplus = breakdown.slice(1).reduce((acc, line) => acc - line.amountPaise, income);
  breakdown.push({
    key: 'surplus',
    label: 'Available surplus',
    amountPaise: surplus,
    source: 'CALCULATED',
    note: 'Income minus every line above.',
  });

  const goals: PlanLine[] = [];
  if (has(p.savingsTargetPaise) && p.savingsTargetPaise > 0) {
    goals.push({
      key: 'savings',
      label: 'Savings target',
      amountPaise: p.savingsTargetPaise,
      source: 'ENTERED',
      note: null,
    });
  }
  const essentialMonth = commitments + baseline.essentialPaise;
  if (has(p.emergencyFundTargetPaise) && p.emergencyFundTargetPaise > 0) {
    const gap = Math.max(0, p.emergencyFundTargetPaise - (p.emergencyFundCurrentPaise ?? 0));
    if (gap > 0) {
      goals.push({
        key: 'emergency',
        label: 'Emergency fund',
        amountPaise: Math.ceil(gap / 12),
        source: 'CALCULATED',
        note: `${formatINR(gap)} still to save, spread over 12 months.`,
      });
    } else {
      suggest(
        'Your emergency fund has reached its target. Keep it somewhere you can reach quickly.',
      );
    }
  } else if (essentialMonth > 0) {
    suggest(
      `A common guideline is an emergency fund of 3 to 6 months of essential costs: about ` +
        `${formatINR(essentialMonth * 3)} to ${formatINR(essentialMonth * 6)} from your figures ` +
        `(fixed commitments plus essential expenses, ${formatINR(essentialMonth)} a month).`,
    );
  }
  for (const [i, e] of p.upcomingExpenses.entries()) {
    if (e.dueMonth <= currentMonth) continue;
    const months = monthsUntil(currentMonth, e.dueMonth);
    goals.push({
      key: `upcoming:${i}`,
      label: `${e.label} (${formatMonthKey(e.dueMonth)})`,
      amountPaise: Math.ceil(e.amountPaise / months),
      source: 'CALCULATED',
      note: `${formatINR(e.amountPaise)} over ${months} ${months === 1 ? 'month' : 'months'}.`,
    });
  }
  const past = p.upcomingExpenses.filter((e) => e.dueMonth <= currentMonth);
  if (past.length) {
    suggest(
      `${past.map((e) => e.label).join(', ')} ${past.length === 1 ? 'is' : 'are'} due this month or earlier, so ${past.length === 1 ? 'it is' : 'they are'} not spread over future months.`,
    );
  }

  const goalTotal = goals.reduce((a, g) => a + g.amountPaise, 0);
  const afterGoals = surplus - goalTotal;
  const status: MoneyPlanResult['status'] =
    afterGoals < 0 ? 'shortfall' : afterGoals < income * 0.05 ? 'tight' : 'on-track';

  // Suggested budgets: essentials and other spending at their average,
  // lifestyle reduced in proportion when the goals do not fit.
  const lifestyle = baseline.lifestylePaise;
  const cutNeeded = Math.max(0, -afterGoals);
  const cut = Math.min(cutNeeded, Math.round(lifestyle * 0.5));
  const factor = lifestyle > 0 ? cut / lifestyle : 0;
  const suggestedBudgets: SuggestedBudget[] = baseline.categories
    .filter(
      (c): c is typeof c & { categoryId: string } =>
        c.categoryId !== null && (c.kind === 'essential' || c.kind === 'lifestyle'),
    )
    .map((c) => {
      const reduce = c.kind === 'lifestyle' && factor > 0;
      return {
        categoryId: c.categoryId,
        name: c.name,
        kind: c.kind,
        averagePaise: c.averagePaise,
        suggestedPaise: roundUp100(reduce ? c.averagePaise * (1 - factor) : c.averagePaise),
        reason: reduce
          ? `${Math.round(factor * 100)}% below your average, to help close the gap`
          : 'Your average, rounded up to the next ₹100',
      };
    });

  if (status === 'shortfall') {
    const pct = percentOf(cutNeeded, lifestyle);
    if (lifestyle > 0 && cutNeeded <= lifestyle * 0.5) {
      lead(
        `To fund these goals, lifestyle spending would need to fall by about ${formatINR(cutNeeded)} a month` +
          (pct === null ? '.' : ` (${Math.round(pct)}% of its average).`) +
          ' The suggested budgets below do that.',
      );
    } else {
      lead(
        `Your goals need ${formatINR(cutNeeded)} a month more than the plan leaves. That is more than ` +
          'half your lifestyle spending, so consider a longer timeline or smaller targets as well.',
      );
    }
  } else if (goals.length === 0 && surplus > 0) {
    lead(
      `About ${formatINR(surplus)} a month is left after commitments and spending. Deciding in ` +
        'advance where it goes, for example a savings target, makes it more likely to be kept.',
    );
  } else if (afterGoals > 0) {
    lead(
      `After your goals about ${formatINR(afterGoals)} a month is unallocated. Moving it on payday ` +
        'to savings or towards a goal keeps it from being spent by default.',
    );
  }

  if (anyCommitment && baseline.commitmentsPaise > commitments * 1.1 + 100_000) {
    suggest(
      `Your transactions show about ${formatINR(baseline.commitmentsPaise)} a month on rent, EMIs and ` +
        `insurance, more than the ${formatINR(commitments)} you entered. Check whether something is missing.`,
    );
  }
  if (baseline.incomePaise > 0 && Math.abs(baseline.incomePaise - income) > income * 0.2) {
    suggest(
      `The income you entered differs from the ${formatINR(baseline.incomePaise)} a month your ` +
        'transactions show. The plan uses the figure you entered.',
    );
  }

  return {
    ready: true,
    missing: [],
    baseline,
    breakdown,
    surplusPaise: surplus,
    goals,
    afterGoalsPaise: afterGoals,
    status,
    suggestions,
    suggestedBudgets,
    disclaimer: PLAN_DISCLAIMER,
  };
}
