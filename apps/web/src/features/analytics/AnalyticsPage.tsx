import { LuChevronRight } from 'react-icons/lu';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatINR, formatMonthKey, monthRangeUtc } from '@moneylens/shared';
import type { CategoryBreakdownItem, MerchantSummaryItem } from '@moneylens/types';
import { DonutChart } from '../../components/charts/DonutChart';
import { categoryColour } from '../../lib/category-colors';
import { Card } from '../../components/Card';
import { FullPageSpinner } from '../../components/FullPageSpinner';
import { ErrorCard, PageHeader } from '../../components/PageHeader';
import { OverviewTiles } from '../dashboard/components/OverviewTiles';
import { SpendingTrendChart } from '../dashboard/components/SpendingTrendChart';
import { useComparisons } from '../insights/useInsights';
import { ComparisonsSection } from './ComparisonsSection';
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
  const comparisons = useComparisons(current);

  if (monthly.isPending) return <FullPageSpinner />;
  if (monthly.isError) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-8">
        <ErrorCard message={monthly.error.message} onRetry={() => void monthly.refetch()} />
      </div>
    );
  }

  const data = monthly.data;
  const monthName = formatMonthKey(data.month);
  const days = monthDays(data.month);
  const hasData = data.availableMonths.length > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 lg:py-12">
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
                className="h-10 rounded-xl border border-ink-200 bg-surface px-3 text-sm shadow-card transition-all duration-200 hover:border-ink-300 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100"
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
            <Link
              to="/imports"
              className="font-medium text-brand-600 hover:underline underline-offset-4 hover:text-brand-700 transition-all duration-200"
            >
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
                    className="shrink-0 text-sm font-medium text-brand-600 hover:underline underline-offset-4 hover:text-brand-700 transition-all duration-200"
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
                <MerchantBars
                  items={merchants.data.items}
                  linkFor={(merchantId) =>
                    `/transactions?from=${days.from}&to=${days.to}&merchantId=${merchantId}`
                  }
                />
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

          {comparisons.isError ? (
            <ErrorCard message={comparisons.error.message} />
          ) : comparisons.data ? (
            <ComparisonsSection data={comparisons.data} monthName={monthName} />
          ) : (
            <p role="status" className="text-sm text-ink-500">
              Loading…
            </p>
          )}

          <p className="text-xs text-ink-500">
            Every figure here is calculated from your confirmed transactions; transfers between your
            own accounts are not counted. Recurring payments are on the{' '}
            <Link
              to="/insights"
              className="font-medium text-brand-600 hover:underline underline-offset-4 hover:text-brand-700 transition-all duration-200"
            >
              Insights
            </Link>{' '}
            page.
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
  const total = items.reduce((a, i) => a + i.amountPaise, 0);
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
      <DonutChart
        slices={items.map((item, i) => ({
          key: item.categoryId ?? item.slug,
          label: item.name,
          value: item.amountPaise,
          color: categoryColour(i),
        }))}
        size={180}
        label={`Spending by category: ${items.map((i) => `${i.name} ${Math.round(i.sharePct)}%`).join(', ')}`}
        center={
          <>
            <span className="text-xl font-bold tracking-tight">{formatINR(total)}</span>
            <span className="mt-0.5 text-xs text-ink-500">spent</span>
          </>
        }
      />
      <ol className="w-full min-w-0 flex-1 space-y-1">
        {items.map((item, index) => {
          const body = (
            <>
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: categoryColour(index) }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.name}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold">{formatINR(item.amountPaise)}</span>
                  <span className="ml-2 inline-block w-12 text-right text-ink-500">
                    {Math.round(item.sharePct)}%
                  </span>
                </span>
              </span>
              <span className="mt-1.5 block h-2 rounded-full bg-ink-100" aria-hidden="true">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.max((item.amountPaise / max) * 100, 1)}%`,
                    background: categoryColour(index),
                  }}
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
                  className="min-w-0 flex-1 rounded-xl px-2 py-2 text-left hover:bg-ink-100 transition-all duration-200"
                  aria-label={`${item.name}: ${formatINR(item.amountPaise)}. Show subcategories`}
                >
                  {body}
                </button>
              ) : (
                <Link
                  to={linkFor(item)}
                  className="block min-w-0 flex-1 rounded-xl px-2 py-2 hover:bg-ink-100 transition-all duration-200"
                >
                  {body}
                </Link>
              )}
              {canDrill && (
                <LuChevronRight className="size-4 shrink-0 text-ink-500" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Merchants as ranked bars, each linking to its transactions. */
function MerchantBars({
  items,
  linkFor,
}: {
  items: MerchantSummaryItem[];
  linkFor: (merchantId: string) => string;
}) {
  const max = Math.max(...items.map((m) => m.amountPaise));
  return (
    <ol className="space-y-3">
      {items.map((m) => (
        <li key={m.merchantId ?? m.name}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            {m.merchantId ? (
              <Link
                to={linkFor(m.merchantId)}
                className="min-w-0 truncate font-medium hover:underline underline-offset-4 hover:text-brand-700 transition-all duration-200"
              >
                {m.name}
              </Link>
            ) : (
              <span className="min-w-0 truncate font-medium">{m.name}</span>
            )}
            <span className="shrink-0 font-semibold tabular-nums">{formatINR(m.amountPaise)}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-2 flex-1 rounded-full bg-ink-100" aria-hidden="true">
              <div
                className="h-full rounded-full bg-series-1"
                style={{ width: `${Math.max((m.amountPaise / max) * 100, 2)}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-xs whitespace-nowrap text-ink-500">
              {m.transactionCount} {m.transactionCount === 1 ? 'payment' : 'payments'}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
