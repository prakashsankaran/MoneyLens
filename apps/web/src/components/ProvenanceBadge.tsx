import type { ProvenanceKind } from '@moneylens/types';

const LABELS: Record<ProvenanceKind, { label: string; className: string; description: string }> = {
  FACT: {
    label: 'Fact',
    className: 'bg-ink-100 text-ink-700',
    description: 'Taken directly from your transactions.',
  },
  CALCULATION: {
    label: 'Calculated',
    className: 'bg-ink-100 text-ink-700',
    description: 'Computed from your transactions with a fixed formula.',
  },
  OBSERVATION: {
    label: 'Observation',
    className: 'bg-brand-50 text-brand-700',
    description: 'A pattern detected by a deterministic rule over your transactions.',
  },
  AI_INTERPRETATION: {
    label: 'AI interpretation',
    className: 'bg-warning-50 text-warning',
    description: 'Written by AI from your calculated figures. It may be wrong.',
  },
  RECOMMENDATION: {
    label: 'Suggestion',
    className: 'bg-sky-50 text-sky-800',
    description: 'An educational suggestion, not professional financial advice.',
  },
};

/** Tells the reader how a statement was produced, so AI text is never mistaken for fact. */
export function ProvenanceBadge({ kind }: { kind: ProvenanceKind }) {
  const meta = LABELS[kind];
  return (
    <span
      title={meta.description}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium uppercase tracking-wide ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}
