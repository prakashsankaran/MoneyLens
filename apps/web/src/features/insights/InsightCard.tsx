import { useState } from 'react';
import { formatINR } from '@moneylens/shared';
import type { Insight, Severity } from '@moneylens/types';
import { ProvenanceBadge } from '../../components/ProvenanceBadge';
import { Amount } from '../transactions/Amount';
import { formatDay } from '../../lib/format';
import { confidenceLabel, metricText } from './insight-format';
import { useTransactionsByIds } from './useInsights';

const SEVERITY: Record<Severity, { label: string; className: string }> = {
  high: { label: 'Worth a look', className: 'bg-negative/10 text-negative' },
  medium: { label: 'Notable', className: 'bg-amber-50 text-warning' },
  low: { label: 'Minor', className: 'bg-ink-100 text-ink-700' },
  info: { label: 'For information', className: 'bg-ink-100 text-ink-500' },
};

/**
 * One insight with its working: what kind of statement it is, the metric
 * behind it, how confident the rule is, the transactions it rests on, and
 * any suggestion kept visibly separate from the finding.
 */
export function InsightCard({ insight }: { insight: Insight }) {
  const [open, setOpen] = useState(false);
  const severity = SEVERITY[insight.severity];
  const count = insight.supportingTransactionIds.length;
  const metric = metricText(insight.metric);

  return (
    <article className="rounded-xl border border-ink-100 bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ProvenanceBadge kind={insight.kind} />
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${severity.className}`}>
          {severity.label}
        </span>
      </div>
      <h3 className="mt-2 text-sm font-semibold">{insight.title}</h3>
      <p className="mt-1 text-sm text-ink-700">{insight.explanation}</p>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        {metric && (
          <div>
            <dt className="text-ink-500">{insight.metric.label}</dt>
            <dd className="font-medium tabular-nums">{metric}</dd>
          </div>
        )}
        {insight.potentialMonthlySavingPaise !== undefined && (
          <div>
            <dt className="text-ink-500">Potential saving</dt>
            <dd className="font-medium tabular-nums text-positive">
              {formatINR(insight.potentialMonthlySavingPaise)} a month
            </dd>
          </div>
        )}
        <div>
          <dt className="text-ink-500">Confidence</dt>
          <dd className="font-medium">{confidenceLabel(insight.confidence)}</dd>
        </div>
      </dl>

      {insight.assumption && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-700">
          <ProvenanceBadge kind="CALCULATION" />
          {insight.assumption}
        </p>
      )}
      {insight.recommendation && (
        <p className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-sky-50/60 p-2 text-sm text-ink-700">
          <ProvenanceBadge kind="RECOMMENDATION" />
          {insight.recommendation}
        </p>
      )}

      {count > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            {open ? 'Hide' : 'Show'} the {count} {count === 1 ? 'transaction' : 'transactions'}{' '}
            behind this
          </button>
          {open && <Evidence ids={insight.supportingTransactionIds} />}
        </div>
      )}
    </article>
  );
}

function Evidence({ ids }: { ids: string[] }) {
  const { data, isPending, isError, error } = useTransactionsByIds(ids, true);
  if (isPending) {
    return (
      <p role="status" className="mt-2 text-xs text-ink-500">
        Loading…
      </p>
    );
  }
  if (isError) return <p className="mt-2 text-xs text-negative">{error.message}</p>;
  return (
    <div className="mt-2">
      <ul className="divide-y divide-ink-100 rounded-lg border border-ink-100 text-sm">
        {data.items.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="min-w-0">
              <span className="block truncate">{t.merchantName ?? 'Unknown'}</span>
              <span className="block text-xs text-ink-500">{formatDay(t.date)}</span>
            </span>
            <Amount paise={t.amountPaise} flow={t.flow} />
          </li>
        ))}
      </ul>
      {ids.length > data.items.length && (
        <p className="mt-1 text-xs text-ink-500">
          Showing {data.items.length} of {ids.length}.
        </p>
      )}
    </div>
  );
}
