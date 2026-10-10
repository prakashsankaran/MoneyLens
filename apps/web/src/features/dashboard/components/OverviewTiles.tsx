import {
  formatINR,
  formatMonthKey,
  pctDelta,
  savingsRateTone,
  type Delta,
  type DeltaTone,
} from '@moneylens/shared';
import type { IconType } from 'react-icons';
import { LuArrowDownLeft, LuPiggyBank, LuWallet } from 'react-icons/lu';
import type { PeriodComparison, PeriodTotals } from '@moneylens/types';
import { ScoreRing } from '../../../components/charts/ScoreRing';

const pillClass: Record<DeltaTone, string> = {
  good: 'bg-positive-50 text-positive',
  bad: 'bg-negative-50 text-negative',
  neutral: 'bg-ink-100 text-ink-700',
};

function DeltaPill({ delta }: { delta: Delta }) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold whitespace-nowrap ${pillClass[delta.tone]}`}
    >
      {delta.text}
    </span>
  );
}

/**
 * The month at a glance: spending as the big number with its change, the
 * savings rate as a ring, and income and savings as smaller tiles.
 */
export function OverviewTiles({
  totals,
  comparison,
}: {
  totals: PeriodTotals;
  comparison: PeriodComparison | null;
}) {
  const prev = comparison ? formatMonthKey(comparison.previousMonth, { short: true }) : '';
  const savedDelta: Delta | undefined =
    comparison && comparison.savedChangePaise !== 0
      ? {
          text: `${comparison.savedChangePaise > 0 ? '▲' : '▼'} ${formatINR(Math.abs(comparison.savedChangePaise))} vs ${prev}`,
          tone: comparison.savedChangePaise > 0 ? 'good' : 'bad',
        }
      : undefined;
  const spendingDelta = comparison
    ? pctDelta(comparison.spendingChangePct, prev, false)
    : undefined;
  const incomeDelta = comparison ? pctDelta(comparison.incomeChangePct, prev, true) : undefined;
  const rate = totals.savingsRatePct;
  const overspent = totals.savedPaise < 0;
  // Far below zero the exact rate stops meaning much and would not fit the ring.
  const rateText = rate === null ? '—' : rate < -999 ? '< −999%' : `${Math.round(rate)}%`;

  return (
    <dl className="list-rise grid grid-cols-2 gap-3 md:gap-4 lg:gap-6 xl:grid-cols-4">
      <div className="@container col-span-2 rounded-2xl border border-ink-200 bg-surface p-4 shadow-card sm:p-5 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <dt className="flex items-center gap-2 text-xs font-medium text-ink-500">
              <TileIcon icon={LuWallet} />
              Spending
            </dt>
            <dd className="mt-3 text-3xl leading-none font-bold tracking-tight [overflow-wrap:anywhere] @sm:text-4xl @md:text-5xl">
              {formatINR(totals.spendingPaise)}
            </dd>
            <dd className="mt-2 text-xs text-ink-500">
              {totals.refundsPaise > 0
                ? `After ${formatINR(totals.refundsPaise)} in refunds`
                : `${totals.spendTransactionCount} payments`}
            </dd>
            {spendingDelta && (
              <dd className="mt-3">
                <DeltaPill delta={spendingDelta} />
              </dd>
            )}
          </div>
          <div className="flex flex-col items-center">
            <dt className="sr-only">Savings rate</dt>
            <dd>
              <ScoreRing
                value={rate === null ? null : Math.max(0, rate)}
                tone={savingsRateTone(rate)}
              >
                <span
                  className={`font-bold tracking-tight ${rateText.length > 4 ? 'text-lg' : 'text-2xl'} ${overspent ? 'text-negative' : ''}`}
                >
                  {rateText}
                </span>
                <span className="text-2xs text-ink-500">
                  {rate === null ? 'No income' : 'kept'}
                </span>
              </ScoreRing>
            </dd>
            <dd className="mt-1.5 text-xs font-medium text-ink-500">
              {rate === null ? 'No income recorded' : 'Savings rate'}
            </dd>
          </div>
        </div>
      </div>

      <Tile
        label="Income"
        icon={LuArrowDownLeft}
        value={formatINR(totals.incomePaise)}
        delta={incomeDelta}
      />
      <Tile
        label={overspent ? 'Overspent' : 'Saved'}
        icon={LuPiggyBank}
        value={formatINR(Math.abs(totals.savedPaise))}
        valueClass={overspent ? 'text-negative' : 'text-positive'}
        delta={savedDelta}
      />
    </dl>
  );
}

function TileIcon({ icon: Icon }: { icon: IconType }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-700">
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

function Tile({
  label,
  icon,
  value,
  valueClass = '',
  delta,
}: {
  label: string;
  icon: IconType;
  value: string;
  valueClass?: string;
  delta: Delta | undefined;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-ink-200 bg-surface p-4 shadow-card sm:p-5 lg:p-6">
      <dt className="flex items-center justify-between gap-2 text-xs font-medium text-ink-500">
        {label}
        <TileIcon icon={icon} />
      </dt>
      <dd
        className={`mt-2 text-2xl font-bold tracking-tight [overflow-wrap:anywhere] ${valueClass}`}
      >
        {value}
      </dd>
      {delta && (
        <dd className="mt-auto pt-3">
          <DeltaPill delta={delta} />
        </dd>
      )}
    </div>
  );
}
