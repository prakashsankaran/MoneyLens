import { formatINR, formatMonthKey, rupeesToPaise } from '@moneylens/shared';
import type {
  AssistantCategoryChange,
  AssistantContext,
  AssistantTopic,
  ReportStatement,
} from '@moneylens/types';
import { matchCategory } from './intent';

/*
 * Calculated statements for each kind of question. Every number comes from
 * the analytics context; this file only chooses and words them. They are
 * shown to the user beside the AI text, and given to the model as the figures
 * it may use.
 */

const inr = formatINR;
const pct = (p: number) => `${Math.abs(p)}%`;
const calc = (text: string): ReportStatement => ({ kind: 'CALCULATION', text });
const obs = (text: string): ReportStatement => ({ kind: 'OBSERVATION', text });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function overview(ctx: AssistantContext): ReportStatement[] {
  const t = ctx.totals;
  const m = formatMonthKey(ctx.month);
  if (t.incomePaise === 0 && t.spendingPaise === 0) return [];
  const saved =
    t.savedPaise >= 0
      ? `kept ${inr(t.savedPaise)}${t.savingsRatePct !== null ? ` (${pct(t.savingsRatePct)} of income)` : ''}`
      : `spent ${inr(-t.savedPaise)} more than you received`;
  const out = [
    calc(`In ${m} you received ${inr(t.incomePaise)}, spent ${inr(t.spendingPaise)} and ${saved}.`),
  ];
  const top = ctx.categories.slice(0, 3);
  if (top.length) {
    out.push(
      calc(
        `Your largest categories were ${top.map((c) => `${c.name} (${inr(c.amountPaise)}, ${pct(c.sharePct)})`).join(', ')}.`,
      ),
    );
  }
  return out;
}

function driverStatement(row: AssistantCategoryChange, ctx: AssistantContext): ReportStatement[] {
  const m = formatMonthKey(ctx.month);
  const p = formatMonthKey(ctx.previousMonth);
  if (row.previousCount === 0) {
    return [obs(`There were no ${row.name} payments in ${p} to compare ${m} with.`)];
  }
  const out = [
    calc(
      `${row.name}: ${plural(row.currentCount, 'payment')} averaging ${inr(row.currentAveragePaise)} in ${m}, against ${plural(row.previousCount, 'payment')} averaging ${inr(row.previousAveragePaise)} in ${p}.`,
    ),
  ];
  const count = row.countChangePct ?? 0;
  const size = row.averageChangePct ?? 0;
  const moved = (v: number) => (v >= 0 ? 'up' : 'down');
  switch (row.driver) {
    case 'frequency':
      out.push(
        obs(
          `The change in ${row.name} came mainly from how often you paid (payments ${moved(count)} ${pct(count)}), not from payment size (average ${moved(size)} ${pct(size)}).`,
        ),
      );
      break;
    case 'size':
      out.push(
        obs(
          `The change in ${row.name} came mainly from payment size (average ${moved(size)} ${pct(size)}), not from how often you paid (payments ${moved(count)} ${pct(count)}).`,
        ),
      );
      break;
    case 'both':
      out.push(
        obs(
          `Both moved for ${row.name}: payments ${moved(count)} ${pct(count)} and the average payment ${moved(size)} ${pct(size)}.`,
        ),
      );
      break;
    case 'neither':
      out.push(
        obs(
          `Neither the number of ${row.name} payments nor their average size changed by 10% or more.`,
        ),
      );
      break;
    default:
      break;
  }
  return out;
}

function change(ctx: AssistantContext): ReportStatement[] {
  const m = formatMonthKey(ctx.month);
  const p = formatMonthKey(ctx.previousMonth);
  if (!ctx.previousTotals || ctx.spendingChangePaise === null) {
    return [obs(`There is no data for ${p}, so there is nothing to compare ${m} with.`)];
  }
  const diff = ctx.spendingChangePaise;
  const out = [
    calc(
      `Spending was ${inr(ctx.totals.spendingPaise)} in ${m}, ${diff >= 0 ? 'up' : 'down'} ${inr(Math.abs(diff))}${ctx.spendingChangePct !== null ? ` (${pct(ctx.spendingChangePct)})` : ''} from ${inr(ctx.previousTotals.spendingPaise)} in ${p}.`,
    ),
  ];
  const movers = ctx.categoryChanges
    .filter((c) => c.topLevel && c.categoryId !== null)
    .filter((c) => (diff >= 0 ? c.changePaise > 0 : c.changePaise < 0))
    .sort((a, b) => Math.abs(b.changePaise) - Math.abs(a.changePaise))
    .slice(0, 3);
  for (const c of movers) {
    out.push(
      calc(
        `${c.name}: ${inr(c.currentPaise)} against ${inr(c.previousPaise)}, ${c.changePaise >= 0 ? 'up' : 'down'} ${inr(Math.abs(c.changePaise))}.`,
      ),
    );
  }
  // What drove the biggest mover, using its largest subcategory change.
  const lead = movers[0];
  if (lead) {
    const sub = ctx.categoryChanges
      .filter((c) => !c.topLevel && Math.sign(c.changePaise) === Math.sign(lead.changePaise))
      .sort((a, b) => Math.abs(b.changePaise) - Math.abs(a.changePaise))[0];
    out.push(...driverStatement(sub ?? lead, ctx).slice(1));
  }
  return out;
}

function merchants(ctx: AssistantContext): ReportStatement[] {
  if (!ctx.topMerchants.length) return [];
  return [
    calc(
      `Your top merchants in ${formatMonthKey(ctx.month)}: ${ctx.topMerchants
        .map(
          (t, i) =>
            `${i + 1}. ${t.name} ${inr(t.amountPaise)} (${plural(t.transactionCount, 'payment')})`,
        )
        .join('; ')}.`,
    ),
  ];
}

function categories(ctx: AssistantContext): ReportStatement[] {
  return ctx.categories
    .slice(0, 6)
    .map((c) =>
      calc(
        `${c.name}: ${inr(c.amountPaise)}, ${pct(c.sharePct)} of spending, ${plural(c.transactionCount, 'payment')}.`,
      ),
    );
}

function increasing(ctx: AssistantContext): ReportStatement[] {
  const rising = ctx.categoryChanges
    .filter(
      (c) =>
        c.categoryId !== null &&
        c.changeVsAverage3Pct !== null &&
        c.changeVsAverage3Pct >= 10 &&
        c.changeVsAverage3Paise >= 50_000,
    )
    .sort((a, b) => b.changeVsAverage3Paise - a.changeVsAverage3Paise)
    .slice(0, 5);
  if (!rising.length) {
    return [obs('No category is more than 10% (and ₹500) above its 3-month average this month.')];
  }
  return rising.map((c) =>
    calc(
      `${c.name}: ${inr(c.currentPaise)} this month against a 3-month average of ${inr(c.average3Paise)}, up ${inr(c.changeVsAverage3Paise)} (${pct(c.changeVsAverage3Pct ?? 0)}).`,
    ),
  );
}

function savings(ctx: AssistantContext, question: string): ReportStatement[] {
  if (!ctx.savingOpportunities.length) {
    return [obs('No potential saving opportunities stand out this month.')];
  }
  const out = ctx.savingOpportunities.map((o) =>
    obs(
      `${o.title}: about ${inr(o.potentialMonthlySavingPaise)} a month.${o.assumption ? ` ${o.assumption}` : ''}`,
    ),
  );
  out.push(
    calc(
      `Together these potential saving opportunities come to about ${inr(ctx.savingOpportunitiesTotalPaise)} a month.`,
    ),
  );
  const target = /(?:₹|rs\.?|inr)\s?(\d[\d,]*)/i.exec(question)?.[1];
  if (target) {
    const targetPaise = rupeesToPaise(target.replace(/,/g, ''));
    const reach = ctx.savingOpportunities.find(
      (o) => o.cumulativeMonthlySavingPaise >= targetPaise,
    );
    out.push(
      calc(
        reach
          ? `The first ${plural(ctx.savingOpportunities.indexOf(reach) + 1, 'opportunity', 'opportunities')} reach ${inr(targetPaise)}: about ${inr(reach.cumulativeMonthlySavingPaise)} a month.`
          : `These estimates come to less than the ${inr(targetPaise)} you asked about, so reaching it would also need cuts elsewhere.`,
      ),
    );
  }
  return out;
}

function recurring(ctx: AssistantContext): ReportStatement[] {
  if (!ctx.recurring.length) return [obs('No active recurring payments were found.')];
  const freq = (f: string) => f.toLowerCase();
  const out = ctx.recurring
    .slice(0, 10)
    .map((r) =>
      calc(
        `${r.label}: ${inr(r.typicalAmountPaise)} ${freq(r.frequency)}${r.frequency === 'MONTHLY' ? '' : `, about ${inr(r.monthlyEquivalentPaise)} a month`}${r.subscriptionLike ? ' (subscription-like)' : ''}.`,
      ),
    );
  out.push(
    calc(
      `Active recurring payments come to about ${inr(ctx.recurringMonthlyPaise)} a month, ${inr(ctx.recurringAnnualPaise)} a year.`,
    ),
  );
  return out;
}

function compare(ctx: AssistantContext): ReportStatement[] {
  const out: ReportStatement[] = [];
  for (const r of ctx.comparisons.filter((c) => c.baseline === 'avg-3' || c.baseline === 'avg-6')) {
    out.push(
      calc(
        `${r.label}: ${inr(r.currentPaise)} against ${inr(r.baselinePaise)}${r.changePct !== null ? `, ${r.changePaise >= 0 ? 'up' : 'down'} ${pct(r.changePct)}` : ''} (${plural(r.baselineMonths, 'month')} of data).`,
      ),
    );
  }
  if (!out.length) return [obs('There are no earlier months to compare with.')];
  const movers = ctx.categoryChanges
    .filter((c) => c.topLevel && c.categoryId !== null && c.changeVsAverage3Pct !== null)
    .sort((a, b) => Math.abs(b.changeVsAverage3Paise) - Math.abs(a.changeVsAverage3Paise))
    .slice(0, 3);
  for (const c of movers) {
    out.push(
      calc(
        `${c.name}: ${inr(c.currentPaise)} against a 3-month average of ${inr(c.average3Paise)}, ${c.changeVsAverage3Paise >= 0 ? 'up' : 'down'} ${inr(Math.abs(c.changeVsAverage3Paise))}.`,
      ),
    );
  }
  return out;
}

function health(ctx: AssistantContext): ReportStatement[] {
  if (ctx.health.score === null) {
    return [obs('There is not enough data to calculate a financial health score for this month.')];
  }
  return [
    calc(
      `Your financial health score for ${formatMonthKey(ctx.month)} is ${ctx.health.score} out of 100.`,
    ),
    ...ctx.health.components
      .filter((c) => c.score !== null)
      .map((c) =>
        calc(`${c.label}: ${c.score} out of 100${c.measured ? ` (${c.measured})` : ''}.`),
      ),
  ];
}

function plan(ctx: AssistantContext): ReportStatement[] {
  if (!ctx.plan) {
    return [obs('You have not saved a money plan yet. Add your figures on the Money Plan screen.')];
  }
  const after = ctx.plan.afterGoalsPaise;
  return [
    calc(
      `Your money plan leaves ${inr(ctx.plan.surplusPaise)} a month before goals and ${after >= 0 ? inr(after) : `a shortfall of ${inr(-after)}`} after them.`,
    ),
  ];
}

export interface FactSet {
  topics: AssistantTopic[];
  facts: ReportStatement[];
}

/** The calculated statements a question needs, without duplicates. */
export function factsFor(
  topics: AssistantTopic[],
  ctx: AssistantContext,
  question: string,
): FactSet {
  const out: ReportStatement[] = [];
  const named = matchCategory(question, ctx);
  for (const topic of topics) {
    switch (topic) {
      case 'overview':
        out.push(...overview(ctx));
        break;
      case 'change':
        out.push(...change(ctx));
        break;
      case 'merchants':
        out.push(...merchants(ctx));
        break;
      case 'categories':
        out.push(...categories(ctx));
        break;
      case 'increasing':
        out.push(...increasing(ctx));
        break;
      case 'savings':
        out.push(...savings(ctx, question));
        break;
      case 'driver': {
        const row =
          named ??
          ctx.categoryChanges
            .filter((c) => c.categoryId !== null && c.previousCount > 0)
            .sort((a, b) => Math.abs(b.changePaise) - Math.abs(a.changePaise))[0];
        if (row) out.push(...driverStatement(row, ctx));
        break;
      }
      case 'recurring':
        out.push(...recurring(ctx));
        break;
      case 'compare':
        out.push(...compare(ctx));
        break;
      case 'health':
        out.push(...health(ctx));
        break;
      case 'plan':
        out.push(...plan(ctx));
        break;
    }
  }
  // A named category gets its own line even when the topic did not ask for it.
  if (named && !topics.includes('driver')) {
    out.push(
      calc(
        `${named.name}: ${inr(named.currentPaise)} in ${formatMonthKey(ctx.month)} from ${plural(named.currentCount, 'payment')}, against ${inr(named.previousPaise)} in ${formatMonthKey(ctx.previousMonth)}.`,
      ),
    );
  }
  const seen = new Set<string>();
  return { topics, facts: out.filter((f) => !seen.has(f.text) && seen.add(f.text)) };
}
