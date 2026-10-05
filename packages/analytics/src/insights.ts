import {
  addMonths,
  dayKeyOf,
  formatINR,
  istWeekday,
  monthsEnding,
  percentOf,
} from '@moneylens/shared';
import type {
  AnalyticsTransaction,
  CategoryRef,
  Insight,
  InsightGroup,
  Observation,
  RecurringSeries,
  Severity,
} from '@moneylens/types';
import { budgetStatus, type BudgetInput } from './budgets';
import { classifyTransaction } from './classify';
import { categoriesAboveAverage, smallTransactionAccumulation } from './observations';
import { spendingOf, spendingPatterns } from './patterns';
import { mean, median } from './stats';
import { categoryBreakdown, groupByMonth, topLevelCategory, topMerchants } from './summary';

/**
 * Behaviour insights: deterministic rules over the user's own transactions.
 * Every rule states its threshold in code, reports the metric that triggered
 * it and the transactions behind it, and words its finding as an observation.
 * Recommendations are kept separate from the finding.
 */

export interface InsightInput {
  /** The month being explained ("2026-09"). */
  month: string;
  /** Transactions for up to 12 months ending with `month`. */
  txs: readonly AnalyticsTransaction[];
  categories: readonly CategoryRef[];
  /** Output of `detectRecurring` over the same transactions. */
  recurring: readonly RecurringSeries[];
  /** Budgets set for `month`, if any. */
  budgets?: readonly BudgetInput[];
  /** "Today", for judging a month in progress. */
  now?: Date;
}

export interface InsightResult {
  insights: Insight[];
  skipped: { rule: string; reason: string }[];
}

type Rule = (ctx: RuleContext) => Insight[] | { skip: string };

interface RuleContext extends InsightInput {
  byMonth: Map<string, AnalyticsTransaction[]>;
  current: AnalyticsTransaction[];
  currentSpend: AnalyticsTransaction[];
  /** Months before `month` (up to 6) that have data, oldest first. */
  historyMonths: string[];
  byId: Map<string, CategoryRef>;
}

const fromObservation = (
  o: Observation,
  group: InsightGroup,
  rule: string,
  confidence: number,
  recommendation: string | null,
): Insight => ({ ...o, group, rule, confidence, recommendation });

const spendOnly = (txs: readonly AnalyticsTransaction[]) =>
  txs.filter((t) => classifyTransaction(t) === 'spend');

const total = (txs: readonly AnalyticsTransaction[]) => txs.reduce((a, t) => a + t.amountPaise, 0);

function severityForPct(pct: number | null): Severity {
  if (pct === null || pct >= 50) return 'high';
  if (pct >= 25) return 'medium';
  return 'low';
}

/** Is the change in a category explained by how often, or by how much each time? */
function frequencyOrSize(
  nowCount: number,
  nowTotal: number,
  beforeCount: number,
  beforeTotal: number,
): string {
  if (beforeCount === 0 || nowCount === 0) return '';
  const countChange = percentOf(nowCount - beforeCount, beforeCount) ?? 0;
  const avgNow = Math.round(nowTotal / nowCount);
  const avgBefore = Math.round(beforeTotal / beforeCount);
  const sizeChange = percentOf(avgNow - avgBefore, avgBefore) ?? 0;
  const driver =
    Math.abs(countChange) >= Math.abs(sizeChange) * 1.5
      ? 'mostly because of how often you paid'
      : Math.abs(sizeChange) >= Math.abs(countChange) * 1.5
        ? 'mostly because each payment was larger or smaller'
        : 'because of both how often and how much';
  return (
    ` That is ${nowCount} payments averaging ${formatINR(avgNow)}, against ${beforeCount} ` +
    `averaging ${formatINR(avgBefore)} before, so the change is ${driver}.`
  );
}

// --- Spending -------------------------------------------------------------

/** 1 & 13: categories above their 3-month average, with a frequency/size breakdown. */
const categoryIncrease: Rule = (ctx) => {
  if (ctx.historyMonths.length < 2) return { skip: 'Needs at least 2 earlier months of data.' };
  const history = monthsEnding(addMonths(ctx.month, -1), 3).map((m) => ctx.byMonth.get(m) ?? []);
  return categoriesAboveAverage(ctx.current, history, ctx.categories).map((o) => {
    const ids = new Set(o.supportingTransactionIds);
    const now = ctx.current.filter((t) => ids.has(t.id));
    const categoryIds = new Set(now.map((t) => t.categoryId));
    const before = history
      .flat()
      .filter((t) => classifyTransaction(t) === 'spend' && categoryIds.has(t.categoryId));
    const months = history.filter((m) => m.length > 0).length || 1;
    const extra = frequencyOrSize(
      now.length,
      total(now),
      Math.round(before.length / months),
      Math.round(total(before) / months),
    );
    return fromObservation(
      { ...o, explanation: o.explanation + extra },
      'spending',
      'category-increase',
      0.8,
      'Look at the payments behind this increase and decide whether it was a one-off or a new habit.',
    );
  });
};

/** 2 & 14: categories well below their 3-month average. */
const categoryDecrease: Rule = (ctx) => {
  if (ctx.historyMonths.length < 2) return { skip: 'Needs at least 2 earlier months of data.' };
  const avgMonths = monthsEnding(addMonths(ctx.month, -1), 3).filter(
    (m) => (ctx.byMonth.get(m) ?? []).length > 0,
  );
  const now = categoryBreakdown(ctx.current, ctx.categories);
  const past = avgMonths.map((m) => categoryBreakdown(ctx.byMonth.get(m) ?? [], ctx.categories));
  const out: Insight[] = [];
  const ids = new Set([...now, ...past.flat()].map((r) => r.categoryId).filter(Boolean));
  for (const id of ids) {
    const amounts = past.map((p) => p.find((r) => r.categoryId === id)?.amountPaise ?? 0);
    if (amounts.filter((a) => a > 0).length < 2) continue;
    const average = mean(amounts);
    const current = now.find((r) => r.categoryId === id)?.amountPaise ?? 0;
    const drop = average - current;
    const pct = percentOf(drop, average) ?? 0;
    if (drop < 100_000 || pct < 20) continue;
    const ref = id ? ctx.byId.get(id) : undefined;
    out.push({
      id: `category-decrease:${ref?.slug ?? id}`,
      kind: 'OBSERVATION',
      group: 'spending',
      rule: 'category-decrease',
      severity: 'info',
      title: `${ref?.name ?? 'A category'} is ${formatINR(drop)} below your ${avgMonths.length}-month average`,
      explanation:
        `You spent ${formatINR(current)} on ${ref?.name ?? 'it'} this month, against an average of ` +
        `${formatINR(average)} (${Math.round(pct)}% lower).`,
      metric: { label: `Below ${avgMonths.length}-month average`, valuePaise: drop },
      supportingTransactionIds: spendOnly(ctx.current)
        .filter((t) => topLevelCategory(t.categoryId, ctx.byId)?.id === id)
        .map((t) => t.id),
      confidence: 0.8,
      recommendation: null,
    });
  }
  return out;
};

/** 13 & 14: total spending month over month. */
const monthOverMonth: Rule = (ctx) => {
  const previous = addMonths(ctx.month, -1);
  const before = ctx.byMonth.get(previous) ?? [];
  if (before.length === 0) return { skip: 'No data for the previous month.' };
  const now = spendingOf(ctx.current);
  const then = spendingOf(before);
  const diff = now - then;
  const pct = percentOf(diff, then);
  if (pct === null || Math.abs(diff) < 200_000 || Math.abs(pct) < 10) return [];
  const up = diff > 0;
  return [
    {
      id: `month-over-month:${up ? 'up' : 'down'}`,
      kind: 'CALCULATION',
      group: 'spending',
      rule: up ? 'month-over-month-increase' : 'month-over-month-decrease',
      severity: up ? severityForPct(pct) : 'info',
      title: `Spending ${up ? 'rose' : 'fell'} ${Math.abs(Math.round(pct))}% from last month`,
      explanation: `You spent ${formatINR(now)} this month and ${formatINR(then)} last month, a ${up ? 'rise' : 'fall'} of ${formatINR(Math.abs(diff))}.`,
      metric: { label: 'Change from last month', valuePaise: diff },
      supportingTransactionIds: [],
      confidence: 1,
      recommendation: up
        ? 'Check the categories that rose most (above) to see what drove the change.'
        : null,
    },
  ];
};

// --- Behaviour ------------------------------------------------------------

/** 3: many small payments. */
const smallTransactions: Rule = (ctx) =>
  smallTransactionAccumulation(ctx.current).map((o) =>
    fromObservation(
      o,
      'behaviour',
      'small-transactions',
      0.9,
      'Small payments are easy to miss. A weekly limit for them can make the total visible.',
    ),
  );

/** 5: weekend spending well above weekday spending. */
const weekendSpending: Rule = (ctx) => {
  const p = spendingPatterns(ctx.txs, ctx.month);
  if (p.weekendRatio === null || p.weekendRatio < 1.5) return [];
  const weekend = ctx.currentSpend.filter((t) => [0, 6].includes(istWeekday(t.date)));
  if (total(weekend) < 200_000) return [];
  return [
    {
      id: 'weekend-spending',
      kind: 'OBSERVATION',
      group: 'behaviour',
      rule: 'weekend-spending',
      severity: p.weekendRatio >= 2 ? 'medium' : 'low',
      title: `Your weekend spending is ${p.weekendRatio.toFixed(1)}x your weekday average`,
      explanation:
        `On an average weekend day you spent ${formatINR(p.weekendDailyAveragePaise)}, against ` +
        `${formatINR(p.weekdayDailyAveragePaise)} on an average weekday.`,
      metric: { label: 'Weekend vs weekday, per day', value: p.weekendRatio, unit: 'x' },
      supportingTransactionIds: weekend.map((t) => t.id),
      confidence: 0.75,
      recommendation: 'Plan weekend spending ahead, for example with a set amount per weekend.',
    },
  ];
};

/** 6: spending in the three days after income arrives. */
const paydaySpike: Rule = (ctx) => {
  const salary = ctx.recurring
    .filter((r) => r.flow === 'IN' && r.frequency === 'MONTHLY' && r.active)
    .sort((a, b) => b.typicalAmountPaise - a.typicalAmountPaise)[0];
  if (!salary) return { skip: 'No regular monthly income found.' };
  const paydays = ctx.current.filter((t) => salary.transactionIds.includes(t.id));
  if (paydays.length === 0) return { skip: 'No regular income arrived this month.' };

  const windowDays = new Set<string>();
  for (const p of paydays) {
    for (let i = 0; i < 3; i += 1) {
      windowDays.add(dayKeyOf(new Date(p.date.getTime() + i * 86_400_000)));
    }
  }
  const inWindow = ctx.currentSpend.filter((t) => windowDays.has(dayKeyOf(t.date)));
  const outside = ctx.currentSpend.filter((t) => !windowDays.has(dayKeyOf(t.date)));
  const daysInMonth = new Set(ctx.current.map((t) => dayKeyOf(t.date))).size;
  const daysOutside = Math.max(1, daysInMonth - windowDays.size);
  // Rent and similar fixed payments often fall on payday; leave them out.
  const fixed = new Set(ctx.recurring.flatMap((r) => r.transactionIds));
  const flexibleIn = inWindow.filter((t) => !fixed.has(t.id));
  const flexibleOut = outside.filter((t) => !fixed.has(t.id));
  const perDayIn = Math.round(total(flexibleIn) / windowDays.size);
  const perDayOut = Math.round(total(flexibleOut) / daysOutside);
  if (perDayOut === 0 || perDayIn < perDayOut * 1.5 || total(flexibleIn) < 200_000) return [];
  const ratio = Math.round((perDayIn / perDayOut) * 10) / 10;
  return [
    {
      id: 'payday-spike',
      kind: 'OBSERVATION',
      group: 'behaviour',
      rule: 'payday-spike',
      severity: ratio >= 2.5 ? 'medium' : 'low',
      title: `Spending in the 3 days after payday is ${ratio}x your usual daily spend`,
      explanation:
        `After ${salary.label} arrived you spent ${formatINR(perDayIn)} a day on non-recurring ` +
        `payments, against ${formatINR(perDayOut)} a day for the rest of the month.`,
      metric: { label: 'Payday days vs other days', value: ratio, unit: 'x' },
      supportingTransactionIds: flexibleIn.map((t) => t.id),
      confidence: 0.7,
      recommendation: 'Move your savings or investment transfer to payday so it happens first.',
    },
  ];
};

/** 9: one merchant takes a large share of spending. */
const merchantConcentration: Rule = (ctx) => {
  if (ctx.currentSpend.length < 10) return { skip: 'Too few payments this month.' };
  const fixed = new Set(
    ctx.recurring.filter((r) => r.flow === 'OUT').flatMap((r) => r.transactionIds),
  );
  // Rent and other fixed payments are concentrated by nature; look at the rest.
  const flexible = ctx.currentSpend.filter((t) => !fixed.has(t.id));
  const top = topMerchants(flexible, 1)[0];
  const sum = total(flexible);
  if (!top || sum === 0) return [];
  const share = percentOf(top.amountPaise, sum) ?? 0;
  if (share < 30 || top.transactionCount < 3) return [];
  return [
    {
      id: 'merchant-concentration',
      kind: 'CALCULATION',
      group: 'behaviour',
      rule: 'merchant-concentration',
      severity: share >= 50 ? 'medium' : 'low',
      title: `${top.name} took ${Math.round(share)}% of your everyday spending`,
      explanation:
        `Leaving out recurring payments, you spent ${formatINR(sum)} this month, and ` +
        `${formatINR(top.amountPaise)} of it across ${top.transactionCount} payments went to ${top.name}.`,
      metric: { label: 'Share of non-recurring spending', value: share, unit: '%' },
      supportingTransactionIds: flexible
        .filter((t) =>
          top.merchantId ? t.merchantId === top.merchantId : t.merchantName === top.name,
        )
        .map((t) => t.id),
      confidence: 0.9,
      recommendation: null,
    },
  ];
};

/** 10: one category takes most of the spending. */
const categoryConcentration: Rule = (ctx) => {
  const rows = categoryBreakdown(ctx.current, ctx.categories);
  const top = rows[0];
  if (!top || rows.length < 3 || top.sharePct < 50) return [];
  return [
    {
      id: 'category-concentration',
      kind: 'CALCULATION',
      group: 'behaviour',
      rule: 'category-concentration',
      severity: 'info',
      title: `${top.name} was ${Math.round(top.sharePct)}% of your spending`,
      explanation: `${formatINR(top.amountPaise)} of this month's spending was ${top.name}.`,
      metric: { label: 'Share of spending', value: top.sharePct, unit: '%' },
      supportingTransactionIds: ctx.currentSpend
        .filter((t) => (topLevelCategory(t.categoryId, ctx.byId)?.id ?? null) === top.categoryId)
        .map((t) => t.id),
      confidence: 0.9,
      recommendation: null,
    },
  ];
};

/** 12: month-to-month spending varies a lot. */
const volatility: Rule = (ctx) => {
  const p = spendingPatterns(ctx.txs, ctx.month);
  if (p.monthlyVolatility === null) return { skip: 'Needs at least 3 months of data.' };
  if (p.monthlyVolatility < 0.25) return [];
  return [
    {
      id: 'spending-volatility',
      kind: 'CALCULATION',
      group: 'behaviour',
      rule: 'spending-volatility',
      severity: p.monthlyVolatility >= 0.4 ? 'medium' : 'low',
      title: `Your monthly spending varies by about ${Math.round(p.monthlyVolatility * 100)}%`,
      explanation:
        `Across the last ${p.volatilityMonths} months, monthly spending typically moved ` +
        `${Math.round(p.monthlyVolatility * 100)}% away from its average (coefficient of variation).`,
      metric: { label: 'Coefficient of variation', value: p.monthlyVolatility },
      supportingTransactionIds: [],
      confidence: Math.min(1, 0.5 + p.volatilityMonths * 0.08),
      recommendation:
        'A steady monthly budget is easier to keep when large irregular costs are planned for in advance.',
    },
  ];
};

/** 15: several transfers to the same person or account in one month. */
const repeatedTransfers: Rule = (ctx) => {
  const transfers = ctx.current.filter(
    (t) =>
      t.flow === 'OUT' &&
      (t.type === 'TRANSFER' || ctx.byId.get(t.categoryId ?? '')?.slug === 'family-transfer'),
  );
  const groups = new Map<string, AnalyticsTransaction[]>();
  for (const t of transfers) {
    const key = t.merchantId ?? t.merchantName ?? 'unknown';
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.values()]
    .filter((g) => g.length >= 3)
    .map((g) => ({
      id: `repeated-transfers:${g[0]?.merchantId ?? g[0]?.merchantName ?? 'unknown'}`,
      kind: 'CALCULATION' as const,
      group: 'behaviour' as const,
      rule: 'repeated-transfers',
      severity: 'info' as const,
      title: `${g.length} transfers to ${g[0]?.merchantName ?? 'the same recipient'} this month`,
      explanation: `They add up to ${formatINR(total(g))}.`,
      metric: { label: 'Transferred', valuePaise: total(g) },
      supportingTransactionIds: g.map((t) => t.id),
      confidence: 0.9,
      recommendation:
        'If these are regular support payments, one scheduled transfer may be simpler to track.',
    }));
};

/** 16 & 17: refunds and cashback. */
const refundsAndCashback: Rule = (ctx) => {
  const out: Insight[] = [];
  const refunds = ctx.current.filter((t) => classifyTransaction(t) === 'refund');
  if (refunds.length >= 2) {
    out.push({
      id: 'refund-pattern',
      kind: 'CALCULATION',
      group: 'behaviour',
      rule: 'refund-pattern',
      severity: 'info',
      title: `${refunds.length} refunds came back this month`,
      explanation: `Refunds totalled ${formatINR(total(refunds))}. They are subtracted from your spending.`,
      metric: { label: 'Refunded', valuePaise: total(refunds) },
      supportingTransactionIds: refunds.map((t) => t.id),
      confidence: 1,
      recommendation:
        refunds.length >= 4
          ? 'Frequent returns can mean impulse purchases; a 24-hour pause before buying may help.'
          : null,
    });
  }
  const cashback = ctx.current.filter((t) => classifyTransaction(t) === 'cashback');
  if (cashback.length >= 1) {
    out.push({
      id: 'cashback-pattern',
      kind: 'CALCULATION',
      group: 'behaviour',
      rule: 'cashback-pattern',
      severity: 'info',
      title: `You earned ${formatINR(total(cashback))} in cashback`,
      explanation: `${cashback.length} cashback ${cashback.length === 1 ? 'payment' : 'payments'} this month. Cashback is shown separately and not counted as income.`,
      metric: { label: 'Cashback', valuePaise: total(cashback) },
      supportingTransactionIds: cashback.map((t) => t.id),
      confidence: 1,
      recommendation: null,
    });
  }
  return out;
};

// --- Recurring ------------------------------------------------------------

/** 7 & 8: recurring and subscription-like payments. */
const recurringSummary: Rule = (ctx) => {
  const outgoing = ctx.recurring.filter((r) => r.flow === 'OUT' && r.active);
  if (outgoing.length === 0) return [];
  const monthly = outgoing.reduce((a, r) => a + r.monthlyEquivalentPaise, 0);
  const subs = outgoing.filter((r) => r.subscriptionLike);
  const out: Insight[] = [
    {
      id: 'recurring-payments',
      kind: 'CALCULATION',
      group: 'recurring',
      rule: 'recurring-payments',
      severity: 'info',
      title: `${outgoing.length} recurring ${outgoing.length === 1 ? 'payment was' : 'payments were'} detected`,
      explanation:
        `Together they come to about ${formatINR(monthly)} a month (${formatINR(monthly * 12)} a year): ` +
        outgoing
          .slice(0, 5)
          .map((r) => r.label)
          .join(', ') +
        (outgoing.length > 5 ? ` and ${outgoing.length - 5} more.` : '.'),
      metric: { label: 'Monthly equivalent', valuePaise: monthly },
      supportingTransactionIds: outgoing.flatMap((r) => r.transactionIds.slice(-1)),
      confidence: mean(outgoing.map((r) => Math.round(r.confidence * 100))) / 100,
      recommendation: null,
    },
  ];
  if (subs.length > 0) {
    const subMonthly = subs.reduce((a, r) => a + r.monthlyEquivalentPaise, 0);
    out.push({
      id: 'subscriptions',
      kind: 'OBSERVATION',
      group: 'recurring',
      rule: 'subscriptions',
      severity: subs.length >= 4 ? 'medium' : 'low',
      title: `${subs.length} subscription-like ${subs.length === 1 ? 'payment' : 'payments'} cost ${formatINR(subMonthly)} a month`,
      explanation:
        `${subs.map((r) => `${r.label} (${formatINR(r.typicalAmountPaise)} ${r.frequency.toLowerCase()})`).join(', ')}. ` +
        'They have a fixed amount on a regular schedule. MoneyLens cannot tell whether you still use them.',
      metric: { label: 'Monthly equivalent', valuePaise: subMonthly },
      supportingTransactionIds: subs.flatMap((r) => r.transactionIds.slice(-1)),
      confidence: 0.8,
      recommendation: 'Review each one and cancel any you no longer use.',
    });
  }
  const stopped = ctx.recurring.filter((r) => r.flow === 'OUT' && !r.active);
  if (stopped.length > 0) {
    out.push({
      id: 'recurring-stopped',
      kind: 'OBSERVATION',
      group: 'recurring',
      rule: 'recurring-stopped',
      severity: 'info',
      title: `${stopped.length} recurring ${stopped.length === 1 ? 'payment seems' : 'payments seem'} to have stopped`,
      explanation: `${stopped.map((r) => `${r.label} (last on ${r.lastDate})`).join(', ')}. No payment arrived when the next one was due.`,
      metric: { label: 'Stopped', value: stopped.length },
      supportingTransactionIds: stopped.flatMap((r) => r.transactionIds.slice(-1)),
      confidence: 0.6,
      recommendation: null,
    });
  }
  return out;
};

// --- Anomalies ------------------------------------------------------------

/** 4: large one-off payments. */
const largeOneOff: Rule = (ctx) => {
  const history = spendOnly(ctx.historyMonths.flatMap((m) => ctx.byMonth.get(m) ?? []));
  if (history.length < 20) return { skip: 'Needs more spending history to know what is usual.' };
  const typical = median(history.map((t) => t.amountPaise));
  const threshold = Math.max(500_000, typical * 10);
  const recurringIds = new Set(ctx.recurring.flatMap((r) => r.transactionIds));
  return ctx.currentSpend
    .filter((t) => t.amountPaise >= threshold && !recurringIds.has(t.id))
    .sort((a, b) => b.amountPaise - a.amountPaise)
    .slice(0, 3)
    .map((t) => ({
      id: `large-one-off:${t.id}`,
      kind: 'OBSERVATION' as const,
      group: 'anomalies' as const,
      rule: 'large-one-off',
      severity: 'low' as const,
      title: `Large one-off payment: ${formatINR(t.amountPaise)} to ${t.merchantName ?? 'an unknown merchant'}`,
      explanation:
        `It is more than 10 times your typical payment of ${formatINR(typical)} and is not part ` +
        'of a recurring series.',
      metric: { label: 'Amount', valuePaise: t.amountPaise },
      supportingTransactionIds: [t.id],
      confidence: 0.8,
      recommendation:
        'If it was planned, nothing to do. If similar costs come up every year, setting aside a little each month spreads them out.',
    }));
};

/** 11: a payment far above what is usual for that merchant. */
const unusualForMerchant: Rule = (ctx) => {
  const past = spendOnly(ctx.historyMonths.flatMap((m) => ctx.byMonth.get(m) ?? []));
  const byMerchant = new Map<string, number[]>();
  for (const t of past) {
    const key = t.merchantId ?? t.merchantName;
    if (key) byMerchant.set(key, [...(byMerchant.get(key) ?? []), t.amountPaise]);
  }
  const out: Insight[] = [];
  for (const t of ctx.currentSpend) {
    const amounts = byMerchant.get(t.merchantId ?? t.merchantName ?? '');
    if (!amounts || amounts.length < 4) continue;
    const avg = mean(amounts);
    const sd = Math.sqrt(amounts.reduce((a, v) => a + (v - avg) ** 2, 0) / amounts.length);
    const limit = avg + 3 * Math.max(sd, avg * 0.1);
    if (t.amountPaise <= limit || t.amountPaise - avg < 50_000) continue;
    out.push({
      id: `unusual-for-merchant:${t.id}`,
      kind: 'OBSERVATION',
      group: 'anomalies',
      rule: 'unusual-for-merchant',
      severity: 'low',
      title: `${formatINR(t.amountPaise)} at ${t.merchantName ?? 'a merchant'} is unusually high`,
      explanation:
        `Your previous ${amounts.length} payments there averaged ${formatINR(avg)}. This one is ` +
        `${Math.round((t.amountPaise / avg) * 10) / 10}x that.`,
      metric: {
        label: 'Times your usual amount',
        value: Math.round((t.amountPaise / avg) * 10) / 10,
        unit: 'x',
      },
      supportingTransactionIds: [t.id],
      confidence: 0.7,
      recommendation: 'Check that this payment is correct.',
    });
  }
  return out.slice(0, 5);
};

// --- Planning -------------------------------------------------------------

/** Recurring payments expected in the 30 days after the month ends. */
const upcomingPayments: Rule = (ctx) => {
  const next = addMonths(ctx.month, 1);
  const [start, end] = [`${next}-01`, `${next}-31`];
  const upcoming = ctx.recurring.filter(
    (r) => r.flow === 'OUT' && r.active && r.nextExpectedDate >= start && r.nextExpectedDate <= end,
  );
  if (upcoming.length === 0) return [];
  const amount = upcoming.reduce((a, r) => a + r.typicalAmountPaise, 0);
  return [
    {
      id: 'upcoming-payments',
      kind: 'CALCULATION',
      group: 'planning',
      rule: 'upcoming-payments',
      severity: 'info',
      title: `About ${formatINR(amount)} of recurring payments are due next month`,
      explanation: `Expected from past patterns: ${upcoming
        .slice(0, 6)
        .map((r) => `${r.label} ${formatINR(r.typicalAmountPaise)} around ${r.nextExpectedDate}`)
        .join('; ')}${upcoming.length > 6 ? `; and ${upcoming.length - 6} more` : ''}.`,
      metric: { label: 'Expected recurring payments', valuePaise: amount },
      supportingTransactionIds: upcoming.flatMap((r) => r.transactionIds.slice(-1)),
      confidence: 0.7,
      recommendation: 'Keep this amount aside at the start of the month.',
    },
  ];
};

/** Budgets over their limit, or on course to go over in the month in progress. */
const budgetAlerts: Rule = (ctx) => {
  if (!ctx.budgets?.length) return { skip: 'No budgets set for this month.' };
  const status = budgetStatus(
    ctx.budgets,
    ctx.current,
    ctx.categories,
    ctx.month,
    ctx.now ?? new Date(),
  );
  const out: Insight[] = [];
  for (const b of status.items) {
    const ids = ctx.currentSpend
      .filter(
        (t) =>
          t.categoryId === b.categoryId ||
          ctx.byId.get(t.categoryId ?? '')?.parentId === b.categoryId,
      )
      .map((t) => t.id);
    if (b.status === 'over') {
      out.push({
        id: `budget-over:${b.categoryId}`,
        kind: 'CALCULATION',
        group: 'planning',
        rule: 'budget-over',
        severity: b.spentPaise >= b.amountPaise * 1.25 ? 'high' : 'medium',
        title: `${b.name} is ${formatINR(b.spentPaise - b.amountPaise)} over its ${formatINR(b.amountPaise)} budget`,
        explanation: `You spent ${formatINR(b.spentPaise)} on ${b.name} this month against a budget of ${formatINR(b.amountPaise)}.`,
        metric: { label: 'Over budget', valuePaise: b.spentPaise - b.amountPaise },
        supportingTransactionIds: ids,
        confidence: 1,
        recommendation:
          "Check whether the budget is realistic, or plan where next month's cut will come from.",
      });
    } else if (b.projectedPaise !== null && b.projectedPaise > b.amountPaise) {
      out.push({
        id: `budget-pace:${b.categoryId}`,
        kind: 'CALCULATION',
        group: 'planning',
        rule: 'budget-pace',
        severity: 'low',
        title: `${b.name} is on course to pass its ${formatINR(b.amountPaise)} budget`,
        explanation:
          `${formatINR(b.spentPaise)} spent in the first ${status.daysElapsed} days. At that pace the month ` +
          `would end near ${formatINR(b.projectedPaise)}. This is a straight-line estimate.`,
        metric: { label: 'Projected for the month', valuePaise: b.projectedPaise },
        supportingTransactionIds: ids,
        confidence: 0.6,
        recommendation: `About ${formatINR(b.remainingPaise)} is left for the rest of the month.`,
      });
    }
  }
  return out;
};

export const INSIGHT_RULES: Record<string, Rule> = {
  'category-increase': categoryIncrease,
  'category-decrease': categoryDecrease,
  'month-over-month': monthOverMonth,
  'small-transactions': smallTransactions,
  'weekend-spending': weekendSpending,
  'payday-spike': paydaySpike,
  'merchant-concentration': merchantConcentration,
  'category-concentration': categoryConcentration,
  'spending-volatility': volatility,
  'repeated-transfers': repeatedTransfers,
  'refunds-and-cashback': refundsAndCashback,
  'recurring-summary': recurringSummary,
  'large-one-off': largeOneOff,
  'unusual-for-merchant': unusualForMerchant,
  'upcoming-payments': upcomingPayments,
  'budget-alerts': budgetAlerts,
};

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };

export function buildContext(input: InsightInput) {
  const byMonth = groupByMonth(input.txs);
  const current = byMonth.get(input.month) ?? [];
  return {
    ...input,
    byMonth,
    current,
    currentSpend: spendOnly(current),
    historyMonths: monthsEnding(addMonths(input.month, -1), 6).filter(
      (m) => (byMonth.get(m) ?? []).length > 0,
    ),
    byId: new Map(input.categories.map((c) => [c.id, c])),
  } satisfies RuleContext;
}

/** Run every rule and return insights ordered by severity. */
export function generateInsights(input: InsightInput): InsightResult {
  const ctx = buildContext(input);
  const insights: Insight[] = [];
  const skipped: InsightResult['skipped'] = [];
  if (ctx.current.length === 0) {
    return { insights, skipped: [{ rule: 'all', reason: 'No transactions in this month.' }] };
  }
  for (const [rule, run] of Object.entries(INSIGHT_RULES)) {
    const result = run(ctx);
    if ('skip' in result) skipped.push({ rule, reason: result.skip });
    else insights.push(...result);
  }
  insights.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (b.metric.valuePaise ?? 0) - (a.metric.valuePaise ?? 0),
  );
  return { insights, skipped };
}
