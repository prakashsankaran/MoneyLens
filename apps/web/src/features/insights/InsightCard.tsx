import { useState } from 'react';
import { formatINR } from '@moneylens/shared';
import type { Insight, Severity } from '@moneylens/types';
import { ProvenanceBadge } from '../../components/ProvenanceBadge';
import { Amount } from '../transactions/Amount';
import { formatDay } from '../../lib/format';
import { confidenceLabel, displayTitle, metricText } from './insight-format';
import { useTransactionsByIds } from './useInsights';

const SEVERITY: Record<Severity, { label?: string; pill: string; accent: string }> = {
  high: {
    label: 'Worth a look',
    pill: 'bg-negative/10 text-negative',
    accent: 'border-l-negative',
  },
  medium: { label: 'Notable', pill: 'bg-amber-50 text-warning', accent: 'border-l-amber-400' },
  low: { pill: '', accent: 'border-l-ink-300' },
  info: { pill: '', accent: 'border-l-ink-100' },
};

/**
 * One insight, headline first: the finding, its key figures and any
 * suggestion are visible at a glance; the working (explanation, calculation,
 * confidence and the transactions behind it) sits behind "Why?".
 */
export function InsightCard({ insight }: { insight: Insight }) {
  const severity = SEVERITY[insight.severity];
  const count = insight.supportingTransactionIds.length;
  const metric = metricText(insight.metric);
  const { title, savingIdea } = displayTitle(insight.title);

  return (
    <article
      className={`rounded-xl border border-l-4 border-ink-200/70 bg-surface p-4 ${severity.accent}`}
    >
      {(severity.label || savingIdea) && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {severity.label && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${severity.pill}`}>
              {severity.label}
            </span>
          )}
          {savingIdea && (
            <span className="rounded-full bg-positive/10 px-2 py-0.5 text-[11px] font-medium text-positive">
              Saving idea
            </span>
          )}
        </div>
      )}
      <h3 className="text-[15px] leading-snug font-semibold">{title}</h3>

      {(metric || insight.potentialMonthlySavingPaise !== undefined) && (
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {metric && (
            <div className="flex flex-col-reverse">
              <dt className="text-xs text-ink-500">{insight.metric.label}</dt>
              <dd className="text-lg leading-tight font-semibold tabular-nums">{metric}</dd>
            </div>
          )}
          {insight.potentialMonthlySavingPaise !== undefined && (
            <div className="flex flex-col-reverse">
              <dt className="text-xs text-ink-500">Potential saving</dt>
              <dd className="text-lg leading-tight font-semibold tabular-nums text-positive">
                {formatINR(insight.potentialMonthlySavingPaise)} a month
              </dd>
            </div>
          )}
        </dl>
      )}

      {insight.recommendation && (
        <p className="mt-3 rounded-xl bg-sky-50/70 px-3 py-2 text-sm text-ink-700">
          <span className="mr-1.5 text-[11px] font-semibold tracking-wide text-sky-800 uppercase">
            Suggestion
          </span>
          {insight.recommendation}
        </p>
      )}

      <details className="group mt-3">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-brand-600 hover:underline [&::-webkit-details-marker]:hidden underline-offset-4 hover:text-brand-700 transition-all duration-200">
          <span aria-hidden className="inline-block transition-transform group-open:rotate-90">
            ›
          </span>
          Why?{count > 0 && ` · ${count} ${count === 1 ? 'transaction' : 'transactions'}`}
        </summary>
        <div className="mt-2 space-y-2 border-t border-ink-100 pt-3 text-sm text-ink-700">
          <p>{insight.explanation}</p>
          {insight.assumption && <p className="text-xs text-ink-500">{insight.assumption}</p>}
          <p className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <ProvenanceBadge kind={insight.kind} />
            {insight.assumption && <ProvenanceBadge kind="CALCULATION" />}
            <span>Confidence {confidenceLabel(insight.confidence)}</span>
          </p>
          {count > 0 && <EvidenceToggle ids={insight.supportingTransactionIds} />}
        </div>
      </details>
    </article>
  );
}

function EvidenceToggle({ ids }: { ids: string[] }) {
  const [open, setOpen] = useState(false);
  const count = ids.length;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-xs font-medium text-brand-600 hover:underline underline-offset-4 hover:text-brand-700 transition-all duration-200"
      >
        {open ? 'Hide' : 'Show'} the {count} {count === 1 ? 'transaction' : 'transactions'} behind
        this
      </button>
      {open && <Evidence ids={ids} />}
    </div>
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
      <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200/70 text-sm">
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
