import { useState } from 'react';
import { Link } from 'react-router';
import { formatMonthKey } from '@moneylens/shared';
import { Card } from '../../components/Card';
import { FullPageSpinner } from '../../components/FullPageSpinner';
import { useAuth } from '../auth/useAuth';
import { HealthScoreSummary } from './components/HealthScoreSummary';
import { MoneyBriefCard } from './components/MoneyBriefCard';
import { OverviewTiles } from './components/OverviewTiles';
import { SavingsOpportunities } from './components/SavingsOpportunities';
import { SpendingTrendChart } from './components/SpendingTrendChart';
import { TopMerchants } from './components/TopMerchants';
import { WhereMoneyWent } from './components/WhereMoneyWent';
import { greetingFor } from './greeting';
import { useDashboard } from './useDashboard';

export function DashboardPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState<string | undefined>(undefined);
  const { data, isPending, isError, error, refetch, isFetching } = useDashboard(month);

  if (isPending) return <FullPageSpinner />;
  if (isError) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Card title="We couldn't load your dashboard">
          <p className="text-sm text-ink-500">{error.message}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 text-sm font-medium text-brand-700 hover:underline"
          >
            Try again
          </button>
        </Card>
      </div>
    );
  }

  const firstName = user?.name.split(' ')[0] ?? '';
  const monthName = formatMonthKey(data.month);
  const hasData = data.availableMonths.length > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-500">
            {greetingFor(new Date())}
            {firstName && `, ${firstName}`}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Your money in {monthName}
          </h1>
        </div>
        {hasData && (
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <span className="sr-only sm:not-sr-only">Month</span>
            <select
              value={data.month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-10 rounded-lg border border-ink-300 bg-surface px-3 text-sm"
            >
              {[...data.availableMonths].reverse().map((m) => (
                <option key={m} value={m}>
                  {formatMonthKey(m)}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {!hasData ? (
        <Card className="mt-8" title="No transactions yet">
          <p className="text-sm text-ink-500">
            Your dashboard fills in once transactions are added. Import a CSV statement from your
            bank to get started; Google Pay PDF and Excel statements are coming next.
          </p>
          <Link
            to="/imports"
            className="mt-4 inline-flex h-11 items-center rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-600"
          >
            Import a statement
          </Link>
        </Card>
      ) : (
        <div className={`mt-6 space-y-6 transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <section aria-label="Financial overview">
            <OverviewTiles totals={data.totals} comparison={data.comparison} />
            <p className="mt-2 text-xs text-ink-500">
              Calculated from your confirmed transactions. Transfers between your own accounts are
              not counted.
            </p>
          </section>

          <div className="grid gap-6 lg:grid-cols-5">
            <Card
              className="lg:col-span-3"
              title={`Where did my money go in ${monthName}?`}
              description="Spending by category, after refunds"
            >
              <WhereMoneyWent categories={data.categories} />
            </Card>
            <Card
              className="lg:col-span-2"
              title="Where can I potentially save?"
              description="Potential saving opportunities and patterns from your recent months"
            >
              <SavingsOpportunities
                opportunities={data.savingOpportunities}
                observations={data.observations}
                historyMonths={data.historyMonths}
              />
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <Card
              className="lg:col-span-3"
              title="How has my spending changed over the last 6 months?"
              description="Monthly income and spending"
            >
              <SpendingTrendChart trend={data.trend} />
            </Card>
            <Card
              className="lg:col-span-2"
              title="Who did I pay the most?"
              description={`Top merchants in ${monthName}`}
            >
              <TopMerchants merchants={data.topMerchants} />
            </Card>
          </div>

          <Card
            title="How healthy are my finances?"
            description={`Financial health score for ${monthName}`}
          >
            <HealthScoreSummary health={data.health} />
          </Card>

          <MoneyBriefCard />
        </div>
      )}
    </div>
  );
}
