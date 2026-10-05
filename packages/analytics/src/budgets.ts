import { monthKeyOf, monthRangeUtc, percentOf } from '@moneylens/shared';
import type { AnalyticsTransaction, BudgetItem, CategoryRef } from '@moneylens/types';
import { classifyTransaction } from './classify';

export interface BudgetInput {
  id: string;
  categoryId: string;
  amountPaise: number;
}

/** A budget is "near" its limit from this share used. */
export const BUDGET_NEAR_PCT = 80;

const DAY_MS = 86_400_000;

/** Days of the IST month that have passed by `now` (all of them for a past month). */
export function monthProgress(
  month: string,
  now: Date,
): { daysElapsed: number; daysInMonth: number } {
  const { start, end } = monthRangeUtc(month);
  const daysInMonth = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  if (now >= end) return { daysElapsed: daysInMonth, daysInMonth };
  if (now < start) return { daysElapsed: 0, daysInMonth };
  return { daysElapsed: Math.floor((now.getTime() - start.getTime()) / DAY_MS) + 1, daysInMonth };
}

/** Does a transaction's category fall under `categoryId` (itself or a subcategory)? */
function under(
  txCategoryId: string | null,
  categoryId: string,
  byId: ReadonlyMap<string, CategoryRef>,
): boolean {
  if (!txCategoryId) return false;
  if (txCategoryId === categoryId) return true;
  return byId.get(txCategoryId)?.parentId === categoryId;
}

/** Net spending (spending minus refunds) under a category. */
function netSpend(
  txs: readonly AnalyticsTransaction[],
  categoryId: string,
  byId: ReadonlyMap<string, CategoryRef>,
): number {
  let total = 0;
  for (const t of txs) {
    if (!under(t.categoryId, categoryId, byId)) continue;
    const kind = classifyTransaction(t);
    if (kind === 'spend') total += t.amountPaise;
    else if (kind === 'refund') total -= t.amountPaise;
  }
  return Math.max(0, total);
}

/**
 * Each budget against the month's spending. A top-level budget includes its
 * subcategories. For the month in progress the projection scales spending so
 * far to the whole month; it is a straight-line estimate.
 */
export function budgetStatus(
  budgets: readonly BudgetInput[],
  monthTxs: readonly AnalyticsTransaction[],
  categories: readonly CategoryRef[],
  month: string,
  now: Date,
) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const { daysElapsed, daysInMonth } = monthProgress(month, now);
  const inProgress = monthKeyOf(now) === month && daysElapsed < daysInMonth;

  const items: BudgetItem[] = budgets.flatMap((b) => {
    const ref = byId.get(b.categoryId);
    if (!ref) return [];
    const spent = netSpend(monthTxs, b.categoryId, byId);
    const usedPct =
      b.amountPaise > 0 ? (percentOf(spent, b.amountPaise) ?? 0) : spent > 0 ? 100 : 0;
    return [
      {
        id: b.id,
        categoryId: b.categoryId,
        name: ref.name,
        slug: ref.slug,
        parentId: ref.parentId,
        amountPaise: b.amountPaise,
        spentPaise: spent,
        remainingPaise: b.amountPaise - spent,
        usedPct,
        status: spent > b.amountPaise ? 'over' : usedPct >= BUDGET_NEAR_PCT ? 'near' : 'under',
        projectedPaise:
          inProgress && daysElapsed > 0 ? Math.round((spent / daysElapsed) * daysInMonth) : null,
      } satisfies BudgetItem,
    ];
  });
  items.sort((a, b) => b.usedPct - a.usedPct || a.name.localeCompare(b.name));

  // Spending not covered by any budget (a parent and a child budget are not double counted).
  let totalSpent = 0;
  let unbudgeted = 0;
  for (const t of monthTxs) {
    const kind = classifyTransaction(t);
    const sign = kind === 'spend' ? 1 : kind === 'refund' ? -1 : 0;
    if (sign === 0) continue;
    totalSpent += sign * t.amountPaise;
    if (!budgets.some((b) => under(t.categoryId, b.categoryId, byId))) {
      unbudgeted += sign * t.amountPaise;
    }
  }

  return {
    items,
    totalBudgetPaise: items.reduce((a, i) => a + i.amountPaise, 0),
    totalSpentPaise: Math.max(0, totalSpent),
    unbudgetedSpendingPaise: Math.max(0, unbudgeted),
    daysElapsed,
    daysInMonth,
  };
}
