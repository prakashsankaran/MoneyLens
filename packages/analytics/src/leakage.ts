import { addMonths, formatINR, monthsEnding, percentOf } from '@moneylens/shared';
import type { AnalyticsTransaction, CategoryRef, Insight } from '@moneylens/types';
import { classifyTransaction } from './classify';
import { buildContext, type InsightInput } from './insights';
import { mean } from './stats';

/**
 * Money leakage: spending patterns where a saving is plausibly available.
 * Each finding needs evidence beyond a single month where a comparison is
 * involved, states its saving estimate as a calculation with the assumption
 * behind it, and is worded as a "Potential saving opportunity", never as
 * waste.
 */

/** Subcategories of everyday, discretionary spending (by slug). */
export const DISCRETIONARY_SLUGS = new Set([
  'restaurants',
  'food-delivery',
  'coffee',
  'snacks',
  'online-shopping',
  'electronics',
  'clothing',
  'cab',
  'ott',
  'movies',
  'games',
  'events',
]);
/** Top-level categories counted as discretionary when no subcategory is set. */
const DISCRETIONARY_PARENTS = new Set(['shopping', 'entertainment']);

export function isDiscretionary(
  categoryId: string | null,
  byId: ReadonlyMap<string, CategoryRef>,
): boolean {
  const c = categoryId ? byId.get(categoryId) : undefined;
  if (!c) return false;
  if (DISCRETIONARY_SLUGS.has(c.slug)) return true;
  return !c.parentId && DISCRETIONARY_PARENTS.has(c.slug);
}

const total = (txs: readonly AnalyticsTransaction[]) => txs.reduce((a, t) => a + t.amountPaise, 0);
const SMALL_PAISE = 30_000;

function opportunity(
  partial: Omit<Insight, 'kind' | 'group' | 'severity' | 'title'> & {
    headline: string;
    potentialMonthlySavingPaise: number;
  },
): Insight {
  const { headline, ...rest } = partial;
  return {
    ...rest,
    kind: 'OBSERVATION',
    group: 'saving',
    severity: partial.potentialMonthlySavingPaise >= 200_000 ? 'medium' : 'low',
    title: `Potential saving opportunity: ${headline}`,
  };
}

/** Run the leakage checks for one month. */
export function findSavingOpportunities(input: InsightInput): Insight[] {
  const ctx = buildContext(input);
  const out: Insight[] = [];
  const spend = ctx.currentSpend;
  const history3 = monthsEnding(addMonths(ctx.month, -1), 3).filter(
    (m) => (ctx.byMonth.get(m) ?? []).length > 0,
  );
  const spendIn = (m: string) =>
    (ctx.byMonth.get(m) ?? []).filter((t) => classifyTransaction(t) === 'spend');
  const recurringIds = new Set(ctx.recurring.flatMap((r) => r.transactionIds));

  // Repeated low-value purchases.
  const small = spend.filter((t) => t.amountPaise < SMALL_PAISE && !recurringIds.has(t.id));
  if (small.length >= 12) {
    const sum = total(small);
    const saving = Math.round(sum / 4);
    out.push(
      opportunity({
        id: 'leak-small-purchases',
        rule: 'leak-small-purchases',
        headline: `${small.length} small purchases added up to ${formatINR(sum)}`,
        explanation: `${small.length} payments under ${formatINR(SMALL_PAISE)} each this month, ${formatINR(sum)} in total.`,
        metric: { label: 'Small purchases this month', valuePaise: sum },
        supportingTransactionIds: small.map((t) => t.id),
        confidence: 0.7,
        potentialMonthlySavingPaise: saving,
        assumption: `If one in four of these purchases were skipped, about ${formatINR(saving)} a month would be saved.`,
        recommendation: 'Pick the most frequent small purchase and set a weekly limit for it.',
      }),
    );
  }

  // Frequent food delivery, above its usual level.
  const delivery = spend.filter((t) => ctx.byId.get(t.categoryId ?? '')?.slug === 'food-delivery');
  if (delivery.length >= 6) {
    const avg = mean(
      history3.map((m) =>
        total(spendIn(m).filter((t) => ctx.byId.get(t.categoryId ?? '')?.slug === 'food-delivery')),
      ),
    );
    const sum = total(delivery);
    const above = history3.length >= 2 ? sum - avg : 0;
    const saving = above > 0 ? above : Math.round(sum / 5);
    out.push(
      opportunity({
        id: 'leak-food-delivery',
        rule: 'leak-food-delivery',
        headline: `${delivery.length} food delivery orders cost ${formatINR(sum)}`,
        explanation:
          `You ordered food ${delivery.length} times this month for ${formatINR(sum)}` +
          (history3.length >= 2
            ? `, against an average of ${formatINR(avg)} a month over the previous ${history3.length} months.`
            : '.'),
        metric: { label: 'Food delivery this month', valuePaise: sum },
        supportingTransactionIds: delivery.map((t) => t.id),
        confidence: 0.75,
        potentialMonthlySavingPaise: saving,
        assumption:
          above > 0
            ? `Bringing food delivery back to your ${history3.length}-month average would save about ${formatINR(saving)} a month.`
            : `Ordering one in five fewer times would save about ${formatINR(saving)} a month.`,
        recommendation: 'Choose one or two fixed days for ordering in.',
      }),
    );
  }

  // Rising discretionary spending.
  if (history3.length >= 2) {
    const disc = (txs: AnalyticsTransaction[]) =>
      txs.filter((t) => isDiscretionary(t.categoryId, ctx.byId));
    const now = disc(spend);
    const avg = mean(history3.map((m) => total(disc(spendIn(m)))));
    const diff = total(now) - avg;
    const pct = percentOf(diff, avg) ?? 0;
    if (diff >= 100_000 && pct >= 15) {
      out.push(
        opportunity({
          id: 'leak-rising-discretionary',
          rule: 'leak-rising-discretionary',
          headline: `everyday spending is ${formatINR(diff)} above your average`,
          explanation:
            `Dining, delivery, shopping, cabs and entertainment came to ${formatINR(total(now))} this month, ` +
            `${Math.round(pct)}% above your ${history3.length}-month average of ${formatINR(avg)}.`,
          metric: { label: 'Above average', valuePaise: diff },
          supportingTransactionIds: now.map((t) => t.id),
          confidence: 0.75,
          potentialMonthlySavingPaise: diff,
          assumption: `Returning to your ${history3.length}-month average would save about ${formatINR(diff)} a month.`,
          recommendation: 'Set a monthly amount for these categories based on your average.',
        }),
      );
    }
  }

  // More than one subscription in the same subcategory (e.g. two OTT services).
  const subs = ctx.recurring.filter((r) => r.subscriptionLike && r.active);
  const bySub = new Map<string, typeof subs>();
  for (const r of subs) {
    if (!r.categoryId) continue;
    bySub.set(r.categoryId, [...(bySub.get(r.categoryId) ?? []), r]);
  }
  for (const [categoryId, list] of bySub) {
    if (list.length < 2) continue;
    const cheapest = [...list].sort(
      (a, b) => a.monthlyEquivalentPaise - b.monthlyEquivalentPaise,
    )[0];
    if (!cheapest) continue;
    const name = ctx.byId.get(categoryId)?.name ?? 'the same category';
    out.push(
      opportunity({
        id: `leak-overlapping-subscriptions:${categoryId}`,
        rule: 'leak-overlapping-subscriptions',
        headline: `${list.length} ${name} subscriptions`,
        explanation: `${list.map((r) => `${r.label} (${formatINR(r.monthlyEquivalentPaise)} a month)`).join(', ')} are all regular ${name} payments.`,
        metric: {
          label: 'Monthly total',
          valuePaise: list.reduce((a, r) => a + r.monthlyEquivalentPaise, 0),
        },
        supportingTransactionIds: list.flatMap((r) => r.transactionIds.slice(-1)),
        confidence: 0.65,
        potentialMonthlySavingPaise: cheapest.monthlyEquivalentPaise,
        assumption: `Dropping the cheapest one, ${cheapest.label}, would save ${formatINR(cheapest.monthlyEquivalentPaise)} a month.`,
        recommendation: 'Check whether you use all of them.',
      }),
    );
  }

  // A merchant whose spending this month is far outside its own history.
  if (history3.length >= 2) {
    const byMerchant = new Map<string, AnalyticsTransaction[]>();
    for (const t of spend) {
      if (recurringIds.has(t.id)) continue;
      const key = t.merchantId ?? t.merchantName;
      if (key) byMerchant.set(key, [...(byMerchant.get(key) ?? []), t]);
    }
    for (const [key, list] of byMerchant) {
      const past = history3.map((m) =>
        total(spendIn(m).filter((t) => (t.merchantId ?? t.merchantName) === key)),
      );
      if (past.filter((p) => p > 0).length < 2) continue;
      const avg = mean(past);
      const sum = total(list);
      if (sum < avg * 2 || sum - avg < 150_000 || list.length < 3) continue;
      out.push(
        opportunity({
          id: `leak-merchant-surge:${key}`,
          rule: 'leak-merchant-surge',
          headline: `${list[0]?.merchantName ?? 'one merchant'} spending doubled`,
          explanation: `${formatINR(sum)} across ${list.length} payments this month, against ${formatINR(avg)} a month on average before.`,
          metric: { label: 'Above average', valuePaise: sum - avg },
          supportingTransactionIds: list.map((t) => t.id),
          confidence: 0.65,
          potentialMonthlySavingPaise: sum - avg,
          assumption: `Returning to your usual level would save about ${formatINR(sum - avg)} a month.`,
          recommendation: null,
        }),
      );
    }
  }

  return out.sort(
    (a, b) => (b.potentialMonthlySavingPaise ?? 0) - (a.potentialMonthlySavingPaise ?? 0),
  );
}
