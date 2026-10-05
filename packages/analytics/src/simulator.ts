import { formatINR, formatMonthKey } from '@moneylens/shared';
import type {
  CategoryRef,
  ObservedBaseline,
  ScenarioAdjustment,
  SimulationResult,
} from '@moneylens/types';

/** Projection horizons, in years. */
export const PROJECTION_YEARS = [1, 3, 5, 10];
/** Highest assumed annual return the simulator accepts, in percent. */
export const MAX_ASSUMED_RETURN_PCT = 15;

export interface SimulationInput {
  baseline: ObservedBaseline;
  categories: readonly CategoryRef[];
  adjustments: readonly ScenarioAdjustment[];
  /** Assumed yearly return on the money kept, in percent (0 to 15). */
  annualReturnPct: number;
}

/**
 * Value after `months` monthly contributions with monthly compounding at
 * `annualPct / 12`, contributions at each month's end. With no return it is
 * the plain sum.
 */
export function futureValue(monthly: number, months: number, annualPct: number): number {
  if (annualPct === 0 || monthly <= 0) return monthly * months;
  const i = annualPct / 100 / 12;
  return Math.round(monthly * (((1 + i) ** months - 1) / i));
}

/**
 * What-if scenarios against the user's recent monthly averages. Each
 * adjustment is converted to a monthly amount kept (or lost); the projection
 * compounds that amount at an assumed, not guaranteed, return.
 */
export function simulate(input: SimulationInput): SimulationResult {
  const { baseline, adjustments } = input;
  const annualReturnPct = Math.min(Math.max(input.annualReturnPct, 0), MAX_ASSUMED_RETURN_PCT);
  const byId = new Map(input.categories.map((c) => [c.id, c]));
  const months = baseline.months.length;
  const averageOf = (categoryId: string) =>
    baseline.categories
      .filter(
        (c) =>
          c.categoryId === categoryId ||
          (c.categoryId !== null && byId.get(c.categoryId)?.parentId === categoryId),
      )
      .reduce((a, c) => a + c.averagePaise, 0);
  const nameOf = (categoryId: string) => byId.get(categoryId)?.name ?? 'that category';
  const avgText = `${months}-month average`;

  const results = adjustments.map((a): SimulationResult['adjustments'][number] => {
    switch (a.type) {
      case 'category-percent': {
        const avg = averageOf(a.categoryId);
        const impact = Math.round((avg * a.percent) / 100);
        return {
          description: `Reduce ${nameOf(a.categoryId)} by ${a.percent}%`,
          monthlyImpactPaise: impact,
          note:
            avg === 0
              ? `No ${nameOf(a.categoryId)} spending in your ${avgText}, so this changes nothing.`
              : `${a.percent}% of your ${avgText} of ${formatINR(avg)}.`,
        };
      }
      case 'category-amount': {
        const avg = averageOf(a.categoryId);
        const impact = Math.min(a.amountPaise, avg);
        return {
          description: `Reduce ${nameOf(a.categoryId)} by ${formatINR(a.amountPaise)} a month`,
          monthlyImpactPaise: impact,
          note:
            impact < a.amountPaise
              ? `Limited to your ${avgText} of ${formatINR(avg)}: spending cannot fall below zero.`
              : null,
        };
      }
      case 'save-more':
        return {
          description: `Save ${formatINR(a.amountPaise)} more a month`,
          monthlyImpactPaise: a.amountPaise,
          note: 'Assumes the money comes from spending you choose to cut.',
        };
      case 'income-change':
        return {
          description: `${a.amountPaise >= 0 ? 'Income rises' : 'Income falls'} by ${formatINR(Math.abs(a.amountPaise))} a month`,
          monthlyImpactPaise: a.amountPaise,
          note: a.amountPaise >= 0 ? 'Assumes all of the extra income is kept, not spent.' : null,
        };
    }
  });

  const monthly = results.reduce((s, r) => s + r.monthlyImpactPaise, 0);
  const saved = baseline.incomePaise - baseline.spendingPaise;
  return {
    baseline: {
      months: baseline.months,
      incomePaise: baseline.incomePaise,
      spendingPaise: baseline.spendingPaise,
      savedPaise: saved,
    },
    adjustments: results,
    monthlyImpactPaise: monthly,
    annualImpactPaise: monthly * 12,
    newMonthlySavedPaise: saved + monthly,
    annualReturnPct,
    projections: PROJECTION_YEARS.map((years) => ({
      years,
      contributedPaise: monthly * years * 12,
      withReturnPaise: futureValue(monthly, years * 12, annualReturnPct),
    })),
    assumptions: [
      `Starting point: your ${avgText} (${baseline.months.map((m) => formatMonthKey(m)).join(', ') || 'no data'}).`,
      'The change is kept up every month for the whole period.',
      annualReturnPct > 0
        ? `Projections assume a ${annualReturnPct}% yearly return, compounded monthly. Returns are not guaranteed and can be lower or negative; inflation and tax are not included.`
        : 'Projections assume no investment return, inflation or tax.',
    ],
  };
}
