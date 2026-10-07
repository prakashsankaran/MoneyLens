import { foldCategories, formatINR } from '@moneylens/shared';
import type { CategoryBreakdownItem } from '@moneylens/types';
import { DonutChart } from '../../../components/charts/DonutChart';
import { categoryColour, COLOURED_CATEGORIES } from '../../../lib/category-colors';

/**
 * Categories as a donut with the month's total in the middle, beside a ranked
 * legend. Categories past the sixth fold into "Everything else" so the donut
 * never needs more colours than a reader can tell apart.
 */
export function WhereMoneyWent({ categories }: { categories: CategoryBreakdownItem[] }) {
  if (categories.length === 0) {
    return <p className="text-sm text-ink-500">No spending recorded for this month.</p>;
  }

  const rows = foldCategories(categories, COLOURED_CATEGORIES);
  const total = rows.reduce((a, r) => a + r.amountPaise, 0);
  const max = Math.max(...rows.map((r) => r.amountPaise));

  return (
    <div className="@container">
      <div className="flex flex-col items-center gap-6 @lg:flex-row @lg:items-start">
        <DonutChart
          slices={rows.map((r, i) => ({
            key: r.categoryId ?? r.slug,
            label: r.name,
            value: r.amountPaise,
            color: categoryColour(i),
          }))}
          label={`Spending by category: ${rows.map((r) => `${r.name} ${Math.round(r.sharePct)}%`).join(', ')}`}
          center={
            <>
              <span
                className={`font-bold tracking-tight ${formatINR(total).length > 9 ? 'text-base' : 'text-xl'}`}
              >
                {formatINR(total)}
              </span>
              <span className="mt-0.5 text-xs text-ink-500">spent</span>
            </>
          }
        />
        <ol className="w-full min-w-0 flex-1 space-y-3">
          {rows.map((row, index) => (
            <li key={row.categoryId ?? row.slug}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: categoryColour(index) }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{row.name}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold">{formatINR(row.amountPaise)}</span>
                  <span className="ml-2 inline-block w-9 text-right text-xs text-ink-500">
                    {Math.round(row.sharePct)}%
                  </span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-ink-100" aria-hidden="true">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${Math.max((row.amountPaise / max) * 100, 1)}%`,
                    background: categoryColour(index),
                  }}
                />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
