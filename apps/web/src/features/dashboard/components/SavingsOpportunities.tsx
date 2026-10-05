import { Link } from 'react-router';
import { formatINR } from '@moneylens/shared';
import type { Insight, Observation } from '@moneylens/types';
import { ProvenanceBadge } from '../../../components/ProvenanceBadge';

/**
 * Potential saving opportunities, each with its estimated saving and the
 * assumption behind it, followed by categories above their recent average.
 * Worded as opportunities, never as judgements ("wasted").
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
          <li key={o.id} className="rounded-xl border border-ink-100 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <ProvenanceBadge kind={o.kind} />
              {o.potentialMonthlySavingPaise !== undefined && (
                <span className="text-xs font-medium text-positive">
                  About {formatINR(o.potentialMonthlySavingPaise)} a month
                </span>
              )}
            </div>
            <p className="mt-2 text-sm font-medium">{o.title}</p>
            {o.assumption && <p className="mt-1 text-sm text-ink-500">{o.assumption}</p>}
            <p className="mt-2 text-xs text-ink-500">
              Based on {o.supportingTransactionIds.length}{' '}
              {o.supportingTransactionIds.length === 1 ? 'transaction' : 'transactions'}
            </p>
          </li>
        ))}
        {shownObservations.map((o) => (
          <li key={o.id} className="rounded-xl border border-ink-100 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <ProvenanceBadge kind={o.kind} />
            </div>
            <p className="mt-2 text-sm font-medium">{o.title}</p>
            <p className="mt-1 text-sm text-ink-500">{o.explanation}</p>
            <p className="mt-2 text-xs text-ink-500">
              Based on {o.supportingTransactionIds.length}{' '}
              {o.supportingTransactionIds.length === 1 ? 'transaction' : 'transactions'}
            </p>
          </li>
        ))}
      </ul>
      <Link
        to="/insights"
        className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline"
      >
        See all insights and the evidence
      </Link>
    </div>
  );
}
