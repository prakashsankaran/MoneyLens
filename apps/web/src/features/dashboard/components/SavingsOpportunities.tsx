import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { formatINR } from '@moneylens/shared';
import type { Insight, Observation } from '@moneylens/types';
import { ProvenanceBadge } from '../../../components/ProvenanceBadge';
import { displayTitle, metricText } from '../../insights/insight-format';

/**
 * Potential saving opportunities led by their estimated monthly saving, then
 * categories above their recent average led by the amount. The reasoning sits
 * behind "Why?". Worded as opportunities, never as judgements ("wasted").
 */
export function SavingsOpportunities({
  opportunities,
  observations,
  historyMonths,
}: {
  opportunities: Insight[];
  observations: Observation[];
  historyMonths: number;
}) {
  const shownOpportunities = opportunities.slice(0, 3);
  const shownObservations = observations.slice(0, Math.max(0, 4 - shownOpportunities.length));
  if (shownOpportunities.length === 0 && shownObservations.length === 0) {
    return (
      <p className="text-sm text-ink-500">
        {historyMonths < 2
          ? 'Comparisons need at least two earlier months of transactions. Nothing to flag yet.'
          : 'Nothing stands out this month compared with your recent months.'}
      </p>
    );
  }
  return (
    <div>
      <ul className="space-y-3">
        {shownOpportunities.map((o) => (
          <Item
            key={o.id}
            accent="border-l-positive"
            figure={
              o.potentialMonthlySavingPaise !== undefined && (
                <p className="text-positive">
                  <span className="sr-only">About </span>
                  <span className="text-2xl font-bold tracking-tight">
                    {formatINR(o.potentialMonthlySavingPaise)}
                  </span>
                  <span className="ml-1 text-sm font-medium"> a month</span>
                </p>
              )
            }
            tag={
              <span className="rounded-full bg-positive-50 px-2 py-0.5 text-2xs font-medium text-positive">
                Saving idea
              </span>
            }
            title={displayTitle(o.title).title}
            why={o.assumption}
            count={o.supportingTransactionIds.length}
            kind={o.kind}
          />
        ))}
        {shownObservations.map((o) => {
          const figure = metricText(o.metric);
          return (
            <Item
              key={o.id}
              accent="border-l-amber-400"
              figure={
                figure && (
                  <p>
                    <span className="text-2xl font-bold tracking-tight text-warning">{figure}</span>
                    <span className="ml-1.5 text-xs text-ink-500">{o.metric.label}</span>
                  </p>
                )
              }
              title={o.title}
              why={o.explanation}
              count={o.supportingTransactionIds.length}
              kind={o.kind}
            />
          );
        })}
      </ul>
      <Link
        to="/insights"
        className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline underline-offset-4 hover:text-brand-800 transition-all duration-200"
      >
        See all insights and the evidence
      </Link>
    </div>
  );
}

function Item({
  accent,
  figure,
  tag,
  title,
  why,
  count,
  kind,
}: {
  accent: string;
  figure: ReactNode;
  tag?: ReactNode;
  title: string;
  why: string | undefined;
  count: number;
  kind: Observation['kind'];
}) {
  return (
    <li className={`rounded-xl border border-l-4 border-ink-200 p-4 ${accent}`}>
      <div className="flex flex-wrap items-center gap-2">
        {tag}
        <ProvenanceBadge kind={kind} />
      </div>
      {figure && <div className="mt-2">{figure}</div>}
      <p className="mt-1 text-sm font-medium">{title}</p>
      <details className="group mt-2 text-xs text-ink-500">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-medium text-brand-700 hover:underline [&::-webkit-details-marker]:hidden underline-offset-4 hover:text-brand-800 transition-all duration-200">
          <span aria-hidden className="inline-block transition-transform group-open:rotate-90">
            ›
          </span>
          Why?
        </summary>
        {why && <p className="mt-1.5 text-sm text-ink-700">{why}</p>}
        <p className="mt-1.5">
          Based on {count} {count === 1 ? 'transaction' : 'transactions'}
        </p>
      </details>
    </li>
  );
}
