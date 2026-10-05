import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatINR, formatMonthKey, monthRangeUtc } from '@moneylens/shared';
import type { CategoryBreakdownItem } from '@moneylens/types';
import { Card } from '../../components/Card';
import { FullPageSpinner } from '../../components/FullPageSpinner';
import { ErrorCard, PageHeader } from '../../components/PageHeader';
import { OverviewTiles } from '../dashboard/components/OverviewTiles';
import { SpendingTrendChart } from '../dashboard/components/SpendingTrendChart';
import {
  useCategoryAnalytics,
  useMerchantAnalytics,
  useMonthlyAnalytics,
  useTrendAnalytics,
} from './useAnalytics';

/** "YYYY-MM" → first and last IST day, for linking to the transactions list. */
function monthDays(month: string): { from: string; to: string } {
  const { start, end } = monthRangeUtc(month);
  const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
  return { from: ist(start), to: ist(new Date(end.getTime() - 1)) };
}

export function AnalyticsPage() {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [parent, setParent] = useState<{ id: string; name: string } | null>(null);
  const monthly = useMonthlyAnalytics(month);
  const current = monthly.data?.month;
  const categories = useCategoryAnalytics(current, parent?.id);
  const merchants = useMerchantAnalytics(current);
  // Show up to a year, but not long empty stretches before the first import.
  const monthsWithHistory =
    monthly.data?.availableMonths.filter((m) => m <= (current ?? '')).length ?? 0;
  const trendMonths = Math.min(12, Math.max(6, monthsWithHistory));
  const trend = useTrendAnalytics(current, trendMonths);

  if (monthly.isPending) return <FullPageSpinner />;
  if (monthly.isError) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <ErrorCard message={monthly.error.message} onRetry={() => void monthly.refetch()} />
      </div>
    );
  }

  const data = monthly.data;
  const monthName = formatMonthKey(data.month);
  const days = monthDays(data.month);
  const hasData = data.availableMonths.length > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-10">
      <PageHeader
        title="Analytics"
        description="Your spending by category, merchant and month."
        actions={
          hasData && (
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <span className="sr-only sm:not-sr-only">Month</span>
              <select
                value={data.month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setParent(null);
                }}
                className="h-10 rounded-lg border border-ink-300 bg-surface px-3 text-sm"
              >
                {[...data.availableMonths].reverse().map((m) => (
                  <option key={m} value={m}>
                    {formatMonthKey(m)}
                  </option>
                ))}
              </select>
            </label>
          )
        }
      />

      {!hasData ? (
        <Card className="mt-8" title="Nothing to analyse yet">
          <p className="text-sm text-ink-500">
            Analytics appear once you import transactions.{' '}
            <Link to="/imports" className="font-medium text-brand-700 hover:underline">
              Import a statement
            </Link>
          </p>
        </Card>
      ) : (
        <div className="mt-6 space-y-6">
          <OverviewTiles totals={data.totals} comparison={data.comparison} />

          <div className="grid gap-6 lg:grid-cols-5">
            <Card
              className="lg:col-span-3"
              title={
                parent
                  ? `What made up ${parent.name} in ${monthName}?`
                  : `Where did my money go in ${monthName}?`
              }
              description={
                parent
                  ? 'Subcategories, after refunds'
                  : 'Select a category to see its subcategories'
              }
              action={
                parent && (
                  <button
                    type="button"
                    onClick={() => setParent(null)}
                    className="shrink-0 text-sm font-medium text-brand-700 hover:underline"
                  >
                    All categories
                  </button>
                )
              }
            >
              {categories.isError ? (
                <ErrorCard message={categories.error.message} />
              ) : !categories.data ? (
                <p role="status" className="text-sm text-ink-500">
                  Loading…
                </p>
              ) : (
                <CategoryList
                  items={categories.data.items}
                  drillable={!parent}
                  onSelect={(item) =>
                    item.categoryId && setParent({ id: item.categoryId, name: item.name })
                  }
                  linkFor={(item) =>
                    `/transactions?from=${days.from}&to=${days.to}&categoryId=${item.categoryId ?? 'uncategorized'}`
                  }
                />
              )}
            </Card>

            <Card
              className="lg:col-span-2"
              title={`Who did I pay in ${monthName}?`}
              description="Merchants ranked by spending"
            >
              {merchants.data && merchants.data.items.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-ink-500">
                    <tr>
                      <th scope="col" className="pb-2 font-medium">
                        Merchant
                      </th>
                      <th scope="col" className="pb-2 text-right font-medium">
                        Payments
                      </th>
                      <th scope="col" className="pb-2 text-right font-medium">
                        Spent
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {merchants.data.items.map((m) => (
                      <tr key={m.merchantId ?? m.name}>
                        <td className="max-w-[10rem] truncate py-2">
                          {m.merchantId ? (
                            <Link
                              to={`/transactions?from=${days.from}&to=${days.to}&merchantId=${m.merchantId}`}
                              className="hover:text-brand-700 hover:underline"
                            >
                              {m.name}
                            </Link>
                          ) : (
                            m.name
                          )}
                        </td>
                        <td className="py-2 text-right tabular-nums text-ink-700">
                          {m.transactionCount}
                        </td>
                        <td className="py-2 text-right font-medium tabular-nums">
                          {formatINR(m.amountPaise)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-ink-500">No merchant payments this month.</p>
              )}
            </Card>
          </div>

          <Card
            title={`How has my spending changed over the last ${trendMonths} months?`}
            description="Monthly income and spending"
          >
            {trend.data ? (
              <SpendingTrendChart trend={trend.data.points} />
            ) : (
              <p role="status" className="text-sm text-ink-500">
                Loading…
              </p>
            )}
          </Card>

          <p className="text-xs text-ink-500">
            Recurring payments, weekday patterns and spending volatility are added in a later phase.
            Every figure here is calculated from your confirmed transactions; transfers between your
            own accounts are not counted.
          </p>
        </div>
      )}
    </div>
  );
}

function CategoryList({
  items,
  drillable,
  onSelect,
  linkFor,
}: {
  items: CategoryBreakdownItem[];
  drillable: boolean;
  onSelect: (item: CategoryBreakdownItem) => void;
  linkFor: (item: CategoryBreakdownItem) => string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-ink-500">No spending recorded here.</p>;
  }
  const max = Math.max(...items.map((i) => i.amountPaise));
  return (
    <ol className="space-y-1">
      {items.map((item) => {
        const body = (
          <>
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{item.name}</span>
              <span className="tabular-nums">
                <span className="font-medium">{formatINR(item.amountPaise)}</span>
                <span className="ml-2 inline-block w-12 text-right text-ink-500">
                  {Math.round(item.sharePct)}%
                </span>
              </span>
            </span>
            <span className="mt-1.5 block h-2 rounded-full bg-ink-100" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-series-1"
                style={{ width: `${Math.max((item.amountPaise / max) * 100, 1)}%` }}
              />
            </span>
            <span className="mt-1 block text-xs text-ink-500">
              {item.transactionCount} {item.transactionCount === 1 ? 'payment' : 'payments'}
            </span>
          </>
        );
        const canDrill = drillable && item.categoryId !== null;
        return (
          <li key={item.categoryId ?? item.slug} className="flex items-center gap-2">
            {canDrill ? (
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="min-w-0 flex-1 rounded-lg px-2 py-2 text-left hover:bg-ink-100"
                aria-label={`${item.name}: ${formatINR(item.amountPaise)}. Show subcategories`}
              >
                {body}
              </button>
            ) : (
              <Link
                to={linkFor(item)}
                className="block min-w-0 flex-1 rounded-lg px-2 py-2 hover:bg-ink-100"
              >
                {body}
              </Link>
            )}
            {canDrill && (
              <ChevronRight className="size-4 shrink-0 text-ink-500" aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
