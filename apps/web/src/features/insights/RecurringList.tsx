import { formatINR } from '@moneylens/shared';
import type { RecurringFrequencyKind, RecurringPaymentItem } from '@moneylens/types';
import { formatDayKey } from '../../lib/format';
import { confidenceLabel } from './insight-format';
import { useDismissRecurring, useRecurring } from './useInsights';

const FREQUENCY: Record<RecurringFrequencyKind, string> = {
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  YEARLY: 'Yearly',
};

/** Detected recurring payments and income, with a way to say "not recurring". */
export function RecurringList() {
  const { data, isPending, isError, error } = useRecurring();
  const dismiss = useDismissRecurring();

  if (isPending) {
    return (
      <p role="status" className="text-sm text-ink-500">
        Loading…
      </p>
    );
  }
  if (isError) return <p className="text-sm text-negative">{error.message}</p>;
  if (data.items.length === 0) {
    return (
      <p className="text-sm text-ink-500">
        No recurring payments found yet. A payment needs at least three regular occurrences (two for
        yearly ones) to be detected.
      </p>
    );
  }

  const outgoing = data.items.filter((i) => i.flow === 'OUT');
  const incoming = data.items.filter((i) => i.flow === 'IN');

  return (
    <div className="space-y-4">
      <p className="text-sm">
        Active recurring payments come to{' '}
        <strong className="tabular-nums">{formatINR(data.monthlyOutgoingPaise)} a month</strong> (
        {formatINR(data.annualOutgoingPaise)} a year).
      </p>
      {dismiss.isError && (
        <p role="alert" className="text-sm text-negative">
          {dismiss.error.message}
        </p>
      )}
      <Section
        title="Payments"
        items={outgoing}
        onToggle={(i) => dismiss.mutate({ id: i.id, dismissed: !i.dismissed })}
        busyId={dismiss.isPending ? dismiss.variables?.id : undefined}
      />
      {incoming.length > 0 && (
        <Section
          title="Regular income"
          items={incoming}
          onToggle={(i) => dismiss.mutate({ id: i.id, dismissed: !i.dismissed })}
          busyId={dismiss.isPending ? dismiss.variables?.id : undefined}
        />
      )}
    </div>
  );
}

function Section({
  title,
  items,
  onToggle,
  busyId,
}: {
  title: string;
  items: RecurringPaymentItem[];
  onToggle: (item: RecurringPaymentItem) => void;
  busyId?: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-2 divide-y divide-ink-100">
        {items.map((i) => (
          <li
            key={i.id}
            className={`flex flex-wrap items-start justify-between gap-3 py-3 ${i.dismissed ? 'opacity-60' : ''}`}
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {i.label}
                {i.subscriptionLike && (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700">
                    Subscription-like
                  </span>
                )}
                {!i.active && (
                  <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] text-ink-700">
                    Seems to have stopped
                  </span>
                )}
                {i.dismissed && (
                  <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] text-ink-700">
                    Marked not recurring
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                {FREQUENCY[i.frequency]}, {i.amountVaries ? 'usually about ' : ''}
                {formatINR(i.typicalAmountPaise)} · {i.occurrences} payments since{' '}
                {formatDayKey(i.firstDate)} ·{' '}
                {i.active
                  ? `next expected around ${formatDayKey(i.nextExpectedDate)}`
                  : `last on ${formatDayKey(i.lastDate)}`}{' '}
                · confidence {confidenceLabel(i.confidence)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-right text-sm tabular-nums">
                {formatINR(i.monthlyEquivalentPaise)}
                <span className="block text-xs text-ink-500">a month</span>
              </span>
              <button
                type="button"
                onClick={() => onToggle(i)}
                disabled={busyId === i.id}
                className="rounded-lg border border-ink-300 px-3 py-1.5 text-xs font-medium hover:bg-ink-100 disabled:opacity-50"
                aria-label={`${i.dismissed ? 'Restore' : 'Not recurring:'} ${i.label}`}
              >
                {i.dismissed ? 'Restore' : 'Not recurring'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
