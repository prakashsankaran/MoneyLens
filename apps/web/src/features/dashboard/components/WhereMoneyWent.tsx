import { formatINR } from '@moneylens/shared';
import type { CategoryBreakdownItem } from '@moneylens/types';

const MAX_ROWS = 6;

/**
 * Ranked horizontal bars: the clearest way to compare a handful of category
 * totals. One series, so one colour; categories past the sixth fold into
 * "Everything else" so the list stays readable.
 */
export function WhereMoneyWent({ categories }: { categories: CategoryBreakdownItem[] }) {
  if (categories.length === 0) {
    return <p className="text-sm text-ink-500">No spending recorded for this month.</p>;
  }

  const shown = categories.slice(0, MAX_ROWS);
  const rest = categories.slice(MAX_ROWS);
  const rows = rest.length
    ? [
        ...shown,
        {
          categoryId: '__rest__',
          name: `Everything else (${rest.length})`,
          slug: 'rest',
          color: null,
          amountPaise: rest.reduce((a, c) => a + c.amountPaise, 0),
          sharePct: Math.round(rest.reduce((a, c) => a + c.sharePct, 0) * 10) / 10,
          transactionCount: rest.reduce((a, c) => a + c.transactionCount, 0),
        },
      ]
    : shown;
  const max = Math.max(...rows.map((r) => r.amountPaise));

  return (
    <ol className="space-y-4">
      {rows.map((row, index) => (
        <li key={row.categoryId ?? row.slug}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium">
              <span className="mr-2 text-ink-500 tabular-nums">{index + 1}.</span>
              {row.name}
            </span>
            <span className="tabular-nums">
              <span className="font-medium">{formatINR(row.amountPaise)}</span>
              <span className="ml-2 inline-block w-12 text-right text-ink-500">
                {Math.round(row.sharePct)}%
              </span>
            </span>
          </div>
          <div className="mt-1.5 h-2.5 rounded-full bg-ink-100" aria-hidden="true">
            <div
              className="h-full rounded-full bg-series-1 transition-[width] duration-500"
              style={{ width: `${Math.max((row.amountPaise / max) * 100, 1)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-ink-500">
            {row.transactionCount} {row.transactionCount === 1 ? 'payment' : 'payments'}
          </p>
        </li>
      ))}
    </ol>
  );
}
