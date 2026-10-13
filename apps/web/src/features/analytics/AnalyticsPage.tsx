import { LuChartColumn, LuChartPie, LuStore } from 'react-icons/lu';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { formatMonthKey, monthRangeUtc } from '@moneylens/shared';
import { Card } from '../../components/Card';
import { FullPageSpinner } from '../../components/FullPageSpinner';
import { ErrorCard, PageHeader } from '../../components/PageHeader';
import { OverviewTiles } from '../dashboard/components/OverviewTiles';
import { SpendingTrendChart } from '../dashboard/components/SpendingTrendChart';
import { useComparisons } from '../insights/useInsights';
import { CategoryList, MerchantBars } from './AnalyticsLists';
import { ComparisonsSection } from './ComparisonsSection';
import { PeriodPicker } from './PeriodPicker';
import { PeriodView } from './PeriodView';
import { isPeriodPreset, presetRange, type PeriodPreset, type PeriodRange } from './periods';
import {
  useCategoryAnalytics,
  useMerchantAnalytics,
  useMonthlyAnalytics,
  usePeriodAnalytics,
  useTrendAnalytics,
} from './useAnalytics';

/** "YYYY-MM" → first and last IST day, for linking to the transactions list. */
function monthDays(month: string): { from: string; to: string } {
  const { start, end } = monthRangeUtc(month);
  const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
  return { from: ist(start), to: ist(new Date(end.getTime() - 1)) };
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function AnalyticsPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('period');
  const preset: PeriodPreset = isPeriodPreset(requested) ? requested : 'month';
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
  const latest = monthly.data?.availableMonths.at(-1);
  const custom = customRange(params, latest);
  const range: PeriodRange | null =
    preset === 'month' || !latest
      ? null
      : preset === 'custom'
        ? custom
        : presetRange(preset, latest);
  const period = usePeriodAnalytics(range);

  const choosePreset = (next: PeriodPreset) => {
    const p = new URLSearchParams(params);
    if (next === 'month') p.delete('period');
    else p.set('period', next);
    if (next === 'custom') {
      p.set('from', custom.from);
      p.set('to', custom.to);
    } else {
      p.delete('from');
      p.delete('to');
    }
    setParams(p, { replace: true });
  };

  if (monthly.isPending) return <FullPageSpinner />;
  if (monthly.isError) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-6 lg:px-8">
        <ErrorCard message={monthly.error.message} onRetry={() => void monthly.refetch()} />
      </div>
    );
  }

  const data = monthly.data;
  const monthName = formatMonthKey(data.month);
  const days = monthDays(data.month);
  const hasData = data.availableMonths.length > 0;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-5 md:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Analytics"
        description="Your spending by category, merchant and month, or over a longer period."
        actions={
          hasData &&
          preset === 'month' && (
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <span className="sr-only sm:not-sr-only">Month</span>
              <select
                value={data.month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setParent(null);
                }}
                className="h-10 rounded-xl border border-ink-200 bg-surface px-3 text-sm transition-all duration-200 hover:border-ink-300 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100"
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
              className="font-medium text-brand-700 hover:underline underline-offset-4 hover:text-brand-800 transition-all duration-200"
            >
              Import a statement
            </Link>
          </p>
        </Card>
      ) : (
        <div className="mt-5 space-y-4 md:space-y-6 lg:mt-6">
          <PeriodPicker
            preset={preset}
            custom={custom}
            onPreset={choosePreset}
            onCustom={(r) => {
              const p = new URLSearchParams(params);
              p.set('period', 'custom');
              p.set('from', r.from);
              p.set('to', r.to);
              setParams(p, { replace: true });
            }}
          />
          {preset !== 'month' ? (
            period.isError ? (
              <ErrorCard message={period.error.message} onRetry={() => void period.refetch()} />
            ) : period.data ? (
              <div className={period.isPlaceholderData ? 'opacity-60 transition-opacity' : ''}>
                <PeriodView key={`${period.data.from}:${period.data.to}`} data={period.data} />
              </div>
            ) : (
              <p role="status" className="text-sm text-ink-500">
                Loading…
              </p>
            )
          ) : (
            <>
              <OverviewTiles totals={data.totals} comparison={data.comparison} />

              <div className="list-rise grid gap-4 lg:grid-cols-5 lg:gap-6">
                <Card
                  className="lg:col-span-3"
                  icon={LuChartPie}
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
                        className="shrink-0 text-sm font-medium text-brand-700 hover:underline underline-offset-4 hover:text-brand-800 transition-all duration-200"
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
                  icon={LuStore}
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
                icon={LuChartColumn}
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
                Every figure here is calculated from your confirmed transactions; transfers between
                your own accounts are not counted. Recurring payments are on the{' '}
                <Link
                  to="/insights"
                  className="font-medium text-brand-700 hover:underline underline-offset-4 hover:text-brand-800 transition-all duration-200"
                >
                  Insights
                </Link>{' '}
                page.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** The custom range from the address bar, else the three months ending with the latest data. */
function customRange(params: URLSearchParams, latest: string | undefined): PeriodRange {
  const from = params.get('from');
  const to = params.get('to');
  if (from && to && DAY_KEY.test(from) && DAY_KEY.test(to) && from <= to) {
    return { from, to, compare: 'previous' };
  }
  return latest ? presetRange('3m', latest) : { from: '', to: '', compare: 'previous' };
}
