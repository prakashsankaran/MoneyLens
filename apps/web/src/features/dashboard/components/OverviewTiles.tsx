import { formatINR, formatMonthKey } from '@moneylens/shared';
import type { PeriodComparison, PeriodTotals } from '@moneylens/types';

interface Tile {
  label: string;
  value: string;
  note: string;
  delta?: { text: string; tone: 'good' | 'bad' | 'neutral' } | undefined;
}

function pctDelta(pct: number | null, previous: string, upIsGood: boolean): Tile['delta'] {
  if (pct === null) return undefined;
  const rounded = Math.round(pct);
  if (rounded === 0) return { text: `No change vs ${previous}`, tone: 'neutral' };
  const up = rounded > 0;
  return {
    text: `${up ? '▲' : '▼'} ${Math.abs(rounded)}% vs ${previous}`,
    tone: up === upIsGood ? 'good' : 'bad',
  };
}

const toneClass = { good: 'text-positive', bad: 'text-negative', neutral: 'text-ink-500' };

/** Income, spending, savings and savings rate for the selected month. */
export function OverviewTiles({
  totals,
  comparison,
}: {
  totals: PeriodTotals;
  comparison: PeriodComparison | null;
}) {
  const prev = comparison ? formatMonthKey(comparison.previousMonth, { short: true }) : '';
  const savedDelta =
    comparison && comparison.savedChangePaise !== 0
      ? {
          text: `${comparison.savedChangePaise > 0 ? '▲' : '▼'} ${formatINR(Math.abs(comparison.savedChangePaise))} vs ${prev}`,
          tone: comparison.savedChangePaise > 0 ? ('good' as const) : ('bad' as const),
        }
      : undefined;

  const tiles: Tile[] = [
    {
      label: 'Income',
      value: formatINR(totals.incomePaise),
      note: 'Credits and money received',
      delta: comparison ? pctDelta(comparison.incomeChangePct, prev, true) : undefined,
    },
    {
      label: 'Spending',
      value: formatINR(totals.spendingPaise),
      note:
        totals.refundsPaise > 0
          ? `After ${formatINR(totals.refundsPaise)} in refunds`
          : `${totals.spendTransactionCount} payments`,
      delta: comparison ? pctDelta(comparison.spendingChangePct, prev, false) : undefined,
    },
    {
      label: totals.savedPaise >= 0 ? 'Saved' : 'Overspent',
      value: formatINR(Math.abs(totals.savedPaise)),
      note: 'Income minus spending',
      delta: savedDelta,
    },
    {
      label: 'Savings rate',
      value: totals.savingsRatePct === null ? '—' : `${Math.round(totals.savingsRatePct)}%`,
      note: totals.savingsRatePct === null ? 'No income recorded' : 'Share of income kept',
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-2xl border border-ink-100 bg-surface p-4 sm:p-5">
          <dt className="text-sm text-ink-500">{t.label}</dt>
          <dd className="mt-2 text-2xl font-semibold tracking-tight sm:text-[28px]">{t.value}</dd>
          <dd className="mt-1 text-xs text-ink-500">{t.note}</dd>
          {t.delta && (
            <dd className={`mt-2 text-xs font-medium ${toneClass[t.delta.tone]}`}>
              {t.delta.text}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}
