import type { Observation } from '@moneylens/types';
import { ProvenanceBadge } from '../../../components/ProvenanceBadge';

/**
 * Deterministic observations framed as potential opportunities, never as
 * judgements ("wasted"). Each one shows the evidence it rests on.
 */
export function SavingsOpportunities({
  observations,
  historyMonths,
}: {
  observations: Observation[];
  historyMonths: number;
}) {
  if (observations.length === 0) {
    return (
      <p className="text-sm text-ink-500">
        {historyMonths < 2
          ? 'Comparisons need at least two earlier months of transactions. Nothing to flag yet.'
          : 'Nothing stands out this month compared with your recent months.'}
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {observations.map((o) => (
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
  );
}
