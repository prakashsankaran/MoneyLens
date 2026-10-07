import { LuPrinter } from 'react-icons/lu';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatINR, formatMonthKey } from '@moneylens/shared';
import type { CategoryComparisonRow, Insight, MonthlyReport, PeriodTotals } from '@moneylens/types';
import { DonutChart } from '../../components/charts/DonutChart';
import { ScoreRing } from '../../components/charts/ScoreRing';

import { categoryColour, COLOURED_CATEGORIES } from '../../lib/category-colors';
import { TopMerchants } from '../dashboard/components/TopMerchants';
import { Card } from '../../components/Card';
import { FullPageSpinner } from '../../components/FullPageSpinner';
import { ErrorCard, PageHeader } from '../../components/PageHeader';
import { ProvenanceBadge } from '../../components/ProvenanceBadge';
import { formatDay, formatDayKey } from '../../lib/format';
import { HealthScoreBreakdown } from '../insights/HealthScoreCard';
import { InsightCard } from '../insights/InsightCard';
import { useMonthlyReport } from '../insights/useInsights';

/** "+₹1,200" / "−₹300" difference between two amounts. */
function diff(now: number, before: number): string {
  const d = now - before;
  if (d === 0) return 'No change';
  return `${d > 0 ? '+' : '−'}${formatINR(Math.abs(d))}`;
}

export function MonthlyReportPage() {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [compare, setCompare] = useState<string | undefined>(undefined);
  const { data, isPending, isError, error, refetch, isFetching } = useMonthlyReport(month, compare);

  if (isPending) return <FullPageSpinner />;
  if (isError) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-8">
        <ErrorCard message={error.message} onRetry={() => void refetch()} />
      </div>
    );
  }

  const hasData = data.availableMonths.length > 0;
  const label = formatMonthKey(data.month);
  const compareOptions = data.availableMonths.filter((m) => m !== data.month).reverse();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 lg:py-12">
      <PageHeader
        title={`Monthly report: ${label}`}
        description="Everything that happened with your money this month, in one place."
        actions={
          hasData && (
            <>
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <span>Month</span>
                <select
                  value={data.month}
                  onChange={(e) => {
                    setMonth(e.target.value);
                    setCompare(undefined);
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
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <span>Compare with</span>
                <select
                  value={compare ?? data.compareMonth ?? ''}
                  onChange={(e) => setCompare(e.target.value || undefined)}
                  className="h-10 rounded-xl border border-ink-200 bg-surface px-3 text-sm shadow-card transition-all duration-200 hover:border-ink-300 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100"
                >
                  {!data.compareMonth && !compare && <option value="">No earlier month</option>}
                  {compareOptions.map((m) => (
                    <option key={m} value={m}>
                      {formatMonthKey(m)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-ink-200 px-3 text-sm hover:bg-ink-50 print:hidden bg-surface shadow-card transition-all duration-200 hover:border-ink-300 active:scale-[0.98]"
              >
                <LuPrinter className="size-4" aria-hidden="true" /> Print
              </button>
            </>
          )
        }
      />

      {!hasData ? (
        <Card className="mt-8" title="No report yet">
          <p className="text-sm text-ink-500">
            Your monthly report appears once you import transactions.{' '}
            <Link
              to="/imports"
              className="font-medium text-brand-600 hover:underline underline-offset-4 hover:text-brand-700 transition-all duration-200"
            >
              Import a statement
            </Link>
          </p>
        </Card>
      ) : (
        <div className={`mt-6 space-y-6 ${isFetching ? 'opacity-60' : ''}`}>
          <ReportBody report={data} />
          <p className="text-xs text-ink-500">
            Every figure is calculated from your confirmed transactions; transfers between your own
            accounts are not counted. Suggestions are educational, not professional financial
            advice.
          </p>
        </div>
      )}
    </div>
  );
}

function ReportBody({ report }: { report: MonthlyReport }) {
  const compareLabel = report.compareMonth ? formatMonthKey(report.compareMonth) : null;
  return (
    <>
      <Section n={1} title="Summary">
        <ul className="space-y-2">
          {report.executiveSummary.map((s) => (
            <li key={s.text} className="flex flex-wrap items-start gap-2 text-sm">
              <ProvenanceBadge kind={s.kind} />
              <span>{s.text}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section n={2} title="Income and spending">
        <TotalsVisual
          totals={report.totals}
          compare={report.compareTotals}
          compareLabel={
            report.compareMonth ? formatMonthKey(report.compareMonth, { short: true }) : null
          }
        />
      </Section>

      <Section n={3} title="Where the money came from">
        {report.incomeSources.length === 0 ? (
          <Empty>No income recorded this month.</Empty>
        ) : (
          <TopMerchants merchants={report.incomeSources} />
        )}
      </Section>

      <Section n={4} title="Spending by category">
        {report.categories.length === 0 ? (
          <Empty>No spending this month.</Empty>
        ) : (
          <CategoryVisual rows={report.categories} compareLabel={compareLabel} />
        )}
      </Section>

      <Section n={5} title="Top merchants">
        {report.merchants.length === 0 ? (
          <Empty>No merchant payments this month.</Empty>
        ) : (
          <TopMerchants merchants={report.merchants} />
        )}
      </Section>

      <Section n={6} title="Recurring payments">
        {report.recurring.length === 0 ? (
          <Empty>No recurring payments found.</Empty>
        ) : (
          <SimpleTable
            head={['Payment', 'How often', 'Usual amount', 'Next expected']}
            rows={report.recurring.map((r) => [
              `${r.label}${r.flow === 'IN' ? ' (income)' : ''}`,
              r.frequency.charAt(0) + r.frequency.slice(1).toLowerCase(),
              formatINR(r.typicalAmountPaise),
              formatDayKey(r.nextExpectedDate),
            ])}
          />
        )}
      </Section>

      <Section n={7} title="Biggest payments">
        {report.biggestTransactions.length === 0 ? (
          <Empty>No payments this month.</Empty>
        ) : (
          <SimpleTable
            head={['Date', 'Paid to', 'Amount']}
            rows={report.biggestTransactions.map((t) => [
              formatDay(t.date),
              t.merchantName ?? 'Unknown',
              formatINR(t.amountPaise),
            ])}
          />
        )}
      </Section>

      <Section n={8} title="What changed">
        <InsightList items={report.changes} empty="No category changed much this month." />
      </Section>

      <Section n={9} title="Habits and unusual payments">
        <InsightList items={report.behaviour} empty="Nothing notable this month." />
      </Section>

      <Section n={10} title="Potential saving opportunities">
        <InsightList
          items={report.savingOpportunities}
          empty="No potential saving opportunities stand out this month."
        />
      </Section>

      <Section n={11} title="Suggestions">
        {report.recommendations.length === 0 ? (
          <Empty>No suggestions this month.</Empty>
        ) : (
          <ul className="space-y-2">
            {report.recommendations.map((r) => (
              <li key={r.text} className="flex flex-wrap items-start gap-2 text-sm">
                <ProvenanceBadge kind={r.kind} />
                <span>{r.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section n={12} title="Financial health">
        <HealthScoreBreakdown health={report.health} />
      </Section>
    </>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <Card title={`${n}. ${title}`} className="break-inside-avoid">
      {children}
    </Card>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-500">{children}</p>;
}

function InsightList({ items, empty }: { items: Insight[]; empty: string }) {
  if (items.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="space-y-3">
      {items.map((i) => (
        <InsightCard key={i.id} insight={i} />
      ))}
    </div>
  );
}

function TotalsVisual({
  totals,
  compare,
  compareLabel,
}: {
  totals: PeriodTotals;
  compare: PeriodTotals | null;
  compareLabel: string | null;
}) {
  const kept = totals.savedPaise;
  const tiles: { label: string; now: number; before?: number; upIsGood: boolean; tone?: string }[] =
    [
      { label: 'Income', now: totals.incomePaise, before: compare?.incomePaise, upIsGood: true },
      {
        label: 'Spending',
        now: totals.spendingPaise,
        before: compare?.spendingPaise,
        upIsGood: false,
      },
      {
        label: kept >= 0 ? 'Kept' : 'Overspent',
        now: Math.abs(kept),
        before: compare ? compare.savedPaise : undefined,
        upIsGood: true,
        tone: kept >= 0 ? 'text-positive' : 'text-negative',
      },
    ];
  const max = Math.max(1, totals.incomePaise, totals.spendingPaise);
  return (
    <div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => {
          const change =
            t.before === undefined ? null : (t.label === 'Overspent' ? kept : t.now) - t.before;
          return (
            <div key={t.label} className="rounded-xl bg-ink-50 p-3.5">
              <dt className="text-xs font-medium text-ink-500">{t.label}</dt>
              <dd className={`mt-1 text-xl font-bold tracking-tight sm:text-2xl ${t.tone ?? ''}`}>
                {formatINR(t.now)}
              </dd>
              {change !== null && compareLabel && (
                <dd
                  className={`mt-1 text-xs font-medium ${
                    change === 0
                      ? 'text-ink-500'
                      : change > 0 === t.upIsGood
                        ? 'text-positive'
                        : 'text-negative'
                  }`}
                >
                  {diff(change, 0)} vs {compareLabel}
                </dd>
              )}
            </div>
          );
        })}
        <div className="flex items-center gap-3 rounded-xl bg-ink-50 p-3.5">
          <ScoreRing
            value={totals.savingsRatePct === null ? null : Math.max(0, totals.savingsRatePct)}
            tone={
              totals.savingsRatePct === null
                ? 'none'
                : totals.savingsRatePct >= 20
                  ? 'good'
                  : totals.savingsRatePct >= 0
                    ? 'fair'
                    : 'poor'
            }
            size={56}
            thickness={6}
          >
            <span className="text-xs font-bold">
              {totals.savingsRatePct === null ? '–' : `${Math.round(totals.savingsRatePct)}%`}
            </span>
          </ScoreRing>
          <div>
            <dt className="text-xs font-medium text-ink-500">Savings rate</dt>
            <dd className="text-sm font-semibold">
              {totals.savingsRatePct === null ? 'No income' : 'of income kept'}
            </dd>
          </div>
        </div>
      </dl>
      <div className="mt-5 space-y-2.5" aria-hidden="true">
        {(
          [
            ['Income', totals.incomePaise, 'bg-series-1'],
            ['Spending', totals.spendingPaise, 'bg-series-2'],
          ] as const
        ).map(([name, value, colour]) => (
          <div key={name} className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-xs">
            <span className="text-ink-500">{name}</span>
            <span className="h-3 rounded-full bg-ink-100">
              <span
                className={`block h-full rounded-full ${colour}`}
                style={{ width: `${Math.max((value / max) * 100, 1)}%` }}
              />
            </span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-ink-500">
        Refunds {formatINR(totals.refundsPaise)} · Cashback {formatINR(totals.cashbackPaise)}
      </p>
    </div>
  );
}

function CategoryVisual({
  rows,
  compareLabel,
}: {
  rows: CategoryComparisonRow[];
  compareLabel: string | null;
}) {
  const sorted = [...rows].sort((a, b) => b.currentPaise - a.currentPaise);
  const spent = sorted.filter((r) => r.currentPaise > 0);
  const total = spent.reduce((a, r) => a + r.currentPaise, 0);
  const shown = spent.slice(0, COLOURED_CATEGORIES);
  const rest = spent.slice(COLOURED_CATEGORIES);
  const slices = [
    ...shown.map((r, i) => ({
      key: r.categoryId ?? r.slug,
      label: r.name,
      value: r.currentPaise,
      color: categoryColour(i),
    })),
    ...(rest.length
      ? [
          {
            key: '__rest__',
            label: 'Everything else',
            value: rest.reduce((a, r) => a + r.currentPaise, 0),
            color: categoryColour(COLOURED_CATEGORIES),
          },
        ]
      : []),
  ];
  return (
    <div className="@container">
      <div className="flex flex-col items-center gap-6 @lg:flex-row @lg:items-start">
        {total > 0 && (
          <DonutChart
            slices={slices}
            size={180}
            label={`Spending by category: ${slices.map((s) => s.label).join(', ')}`}
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
        )}
        <ul className="w-full min-w-0 flex-1 divide-y divide-ink-100">
          {sorted.map((r, i) => {
            const change = r.currentPaise - r.previousPaise;
            return (
              <li key={r.categoryId ?? r.slug} className="flex items-center gap-3 py-2 text-sm">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: r.currentPaise > 0 ? categoryColour(i) : 'transparent' }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.name}</span>
                  <span className="block text-xs text-ink-500">
                    3-month average {formatINR(r.average3Paise)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold tabular-nums">
                    {formatINR(r.currentPaise)}
                  </span>
                  <span
                    className={`block text-xs font-medium tabular-nums ${
                      change === 0 ? 'text-ink-500' : change > 0 ? 'text-negative' : 'text-positive'
                    }`}
                    title={compareLabel ? `Compared with ${compareLabel}` : undefined}
                  >
                    {diff(r.currentPaise, r.previousPaise)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="w-full min-w-[28rem] text-sm">
        <thead className="text-left text-xs text-ink-500">
          <tr>
            {head.map((h, i) => (
              <th
                key={`${h}-${i}`}
                scope="col"
                className={`px-2 pb-2 font-medium ${i > 0 ? 'text-right' : ''}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => (
                <td
                  key={ci}
                  className={`px-2 py-2 ${ci > 0 ? 'text-right tabular-nums' : 'font-medium'}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
