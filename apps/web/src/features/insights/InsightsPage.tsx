import { useState } from 'react';
import { Link } from 'react-router';
import { formatMonthKey } from '@moneylens/shared';
import { INSIGHT_GROUPS, type InsightGroup } from '@moneylens/types';
import { Card } from '../../components/Card';
import { FullPageSpinner } from '../../components/FullPageSpinner';
import { ErrorCard, PageHeader } from '../../components/PageHeader';
import { HealthScoreBreakdown } from './HealthScoreCard';
import { InsightCard } from './InsightCard';
import { RecurringList } from './RecurringList';
import { useHealthScore, useInsights } from './useInsights';

const GROUP_LABELS: Record<InsightGroup, string> = {
  spending: 'Spending',
  saving: 'Saving',
  behaviour: 'Behaviour',
  recurring: 'Recurring',
  anomalies: 'Anomalies',
  planning: 'Planning',
};

const EMPTY_GROUP: Record<InsightGroup, string> = {
  spending: 'No category changed much against your recent months.',
  saving: 'No potential saving opportunities stand out this month.',
  behaviour: 'No notable spending habits this month.',
  recurring: 'No recurring payments found.',
  anomalies: 'No unusual payments this month.',
  planning: 'Nothing expected next month from your recurring payments.',
};

type Tab = InsightGroup | 'all';

export function InsightsPage() {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('all');
  const insights = useInsights(month);
  const health = useHealthScore(insights.data?.month);

  if (insights.isPending) return <FullPageSpinner />;
  if (insights.isError) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-8">
        <ErrorCard message={insights.error.message} onRetry={() => void insights.refetch()} />
      </div>
    );
  }

  const data = insights.data;
  const hasData = data.availableMonths.length > 0;
  const shown = tab === 'all' ? data.insights : data.insights.filter((i) => i.group === tab);
  const count = (g: InsightGroup) => data.insights.filter((i) => i.group === g).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 lg:py-12">
      <PageHeader
        title="Insights"
        description="What stood out in your spending this month."
        actions={
          hasData && (
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <span className="sr-only sm:not-sr-only">Month</span>
              <select
                value={data.month}
                onChange={(e) => setMonth(e.target.value)}
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
        <Card className="mt-8" title="No insights yet">
          <p className="text-sm text-ink-500">
            Insights appear once you import transactions.{' '}
            <Link
              to="/imports"
              className="font-medium text-brand-600 hover:underline underline-offset-4 hover:text-brand-700 transition-all duration-200"
            >
              Import a statement
            </Link>
          </p>
        </Card>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="min-w-0 space-y-4 lg:col-span-2">
            <div
              role="tablist"
              aria-label="Insight groups"
              className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
            >
              {(['all', ...INSIGHT_GROUPS] as Tab[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  role="tab"
                  aria-selected={tab === g}
                  onClick={() => setTab(g)}
                  className={`shrink-0 rounded-xl border px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-all duration-200 active:scale-[0.98] ${
                    tab === g
                      ? 'border-brand-600 bg-brand-600 text-white shadow-sm shadow-brand-600/20'
                      : g !== 'all' && count(g) === 0
                        ? 'border-ink-100 bg-surface text-ink-500 hover:bg-ink-50'
                        : 'border-ink-200 bg-surface text-ink-700 shadow-card hover:border-ink-300 hover:bg-ink-50'
                  }`}
                >
                  {g === 'all' ? 'All' : GROUP_LABELS[g]}{' '}
                  <span className="tabular-nums opacity-80">
                    {g === 'all' ? data.insights.length : count(g)}
                  </span>
                </button>
              ))}
            </div>

            <div role="tabpanel" className="space-y-3">
              {shown.length === 0 ? (
                <p className="rounded-xl border border-ink-200/70 bg-surface p-4 text-sm text-ink-500">
                  {tab === 'all' ? 'Nothing stands out this month.' : EMPTY_GROUP[tab]}
                </p>
              ) : (
                shown.map((i) => <InsightCard key={i.id} insight={i} />)
              )}
            </div>

            {tab === 'recurring' && (
              <Card title="Which payments repeat?" description="Detected from the last 15 months">
                <RecurringList />
              </Card>
            )}

            {data.skipped.length > 0 && (
              <details className="text-sm text-ink-500">
                <summary className="cursor-pointer">
                  {data.skipped.length} {data.skipped.length === 1 ? 'check' : 'checks'} could not
                  run this month
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                  {data.skipped.map((s) => (
                    <li key={s.rule}>
                      {s.rule.replaceAll('-', ' ')}: {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className="text-xs text-ink-500">
              Rule-based, from your confirmed transactions. Not written by AI, and not financial
              advice.
            </p>
          </div>

          <Card
            title="How healthy are my finances?"
            description={formatMonthKey(data.month)}
            className="h-fit"
          >
            {health.data ? (
              <HealthScoreBreakdown health={health.data} />
            ) : health.isError ? (
              <ErrorCard message={health.error.message} />
            ) : (
              <p role="status" className="text-sm text-ink-500">
                Loading…
              </p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
