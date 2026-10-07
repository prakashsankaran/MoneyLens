import { LuPrinter } from 'react-icons/lu';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatINR, formatMonthKey } from '@moneylens/shared';
import type { Insight, MonthlyReport, PeriodTotals } from '@moneylens/types';
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
        <TotalsTable
          totals={report.totals}
          compare={report.compareTotals}
          compareLabel={compareLabel}
        />
      </Section>

      <Section n={3} title="Where the money came from">
        {report.incomeSources.length === 0 ? (
          <Empty>No income recorded this month.</Empty>
        ) : (
          <SimpleTable
            head={['Source', 'Payments', 'Amount']}
            rows={report.incomeSources.map((m) => [
              m.name,
              String(m.transactionCount),
              formatINR(m.amountPaise),
            ])}
          />
        )}
      </Section>

      <Section n={4} title="Spending by category">
        {report.categories.length === 0 ? (
          <Empty>No spending this month.</Empty>
        ) : (
          <SimpleTable
            head={[
              'Category',
              'This month',
              compareLabel ?? 'Compared month',
              'Difference',
              '3-month average',
            ]}
            rows={report.categories.map((c) => [
              c.name,
              formatINR(c.currentPaise),
              formatINR(c.previousPaise),
              diff(c.currentPaise, c.previousPaise),
              formatINR(c.average3Paise),
            ])}
          />
        )}
      </Section>

      <Section n={5} title="Top merchants">
        {report.merchants.length === 0 ? (
          <Empty>No merchant payments this month.</Empty>
        ) : (
          <SimpleTable
            head={['Merchant', 'Payments', 'This month', compareLabel ?? 'Compared month']}
            rows={report.merchants.map((m) => [
              m.name,
              String(m.transactionCount),
              formatINR(m.amountPaise),
              formatINR(m.previousAmountPaise),
            ])}
          />
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

function TotalsTable({
  totals,
  compare,
  compareLabel,
}: {
  totals: PeriodTotals;
  compare: PeriodTotals | null;
  compareLabel: string | null;
}) {
  const rows: [string, number, number | undefined][] = [
    ['Income', totals.incomePaise, compare?.incomePaise],
    ['Spending (after refunds)', totals.spendingPaise, compare?.spendingPaise],
    ['Refunds', totals.refundsPaise, compare?.refundsPaise],
    ['Cashback', totals.cashbackPaise, compare?.cashbackPaise],
    ['Kept (income minus spending)', totals.savedPaise, compare?.savedPaise],
  ];
  return (
    <SimpleTable
      head={['', 'This month', ...(compare ? [compareLabel ?? '', 'Difference'] : [])]}
      rows={[
        ...rows.map(([name, now, before]) => [
          name,
          formatINR(now),
          ...(compare && before !== undefined ? [formatINR(before), diff(now, before)] : []),
        ]),
        [
          'Savings rate',
          totals.savingsRatePct === null ? '–' : `${totals.savingsRatePct}%`,
          ...(compare
            ? [compare.savingsRatePct === null ? '–' : `${compare.savingsRatePct}%`, '']
            : []),
        ],
      ]}
    />
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
