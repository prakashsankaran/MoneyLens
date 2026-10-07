import { formatINR, formatINRCompact } from '@moneylens/shared';
import type { ComparisonsResponse, PeriodComparisonRow } from '@moneylens/types';
import { Card } from '../../components/Card';
import { ProvenanceBadge } from '../../components/ProvenanceBadge';
import { formatDay, formatDayKey } from '../../lib/format';

function changeText(row: PeriodComparisonRow): string {
  if (row.changePct === null) return 'No earlier data';
  const pct = Math.round(row.changePct);
  if (pct === 0) return 'About the same';
  return `${pct > 0 ? 'Up' : 'Down'} ${Math.abs(pct)}%`;
}

/** Spending going up reads as a warning, going down as good news. */
function changeTone(row: PeriodComparisonRow): string {
  if (row.changePct === null || Math.round(row.changePct) === 0) return 'text-ink-700';
  return row.changePct > 0 ? 'text-negative' : 'text-positive';
}

/** Period comparisons and when-you-spend patterns for the Analytics page. */
export function ComparisonsSection({
  data,
  monthName,
}: {
  data: ComparisonsResponse;
  monthName: string;
}) {
  const p = data.patterns;
  const maxDay = Math.max(1, ...p.byWeekday.map((d) => d.amountPaise));
  const maxWeek = Math.max(1, ...p.weekly.map((w) => w.amountPaise));

  return (
    <>
      <Card
        title={`How does ${monthName} compare?`}
        description="Spending after refunds against earlier periods"
        action={<ProvenanceBadge kind="CALCULATION" />}
      >
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {data.totals.map((r) => (
            <li key={r.baseline} className="flex flex-col rounded-xl bg-ink-50 p-3.5 sm:p-4">
              <span className="text-xs font-medium text-ink-500">{r.label}</span>
              <span
                className={`mt-1 font-bold tracking-tight ${r.changePct === null ? 'text-sm' : 'text-xl'} ${changeTone(r)}`}
              >
                {changeText(r)}
              </span>
              <span className="mt-auto pt-1.5 text-xs text-ink-500 tabular-nums">
                {formatINR(r.currentPaise)}
                {r.baselineMonths > 0 && ` vs ${formatINR(r.baselinePaise)}`}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="When do I spend?"
          description={
            p.weekendRatio === null
              ? 'Spending by day of the week'
              : `Per day, weekends averaged ${formatINR(p.weekendDailyAveragePaise)} and weekdays ${formatINR(p.weekdayDailyAveragePaise)} (${p.weekendRatio}x)`
          }
        >
          <ol className="flex h-44 items-end gap-1.5 sm:gap-2">
            {p.byWeekday.map((d) => (
              <li key={d.weekday} className="flex h-full min-w-0 flex-1 flex-col items-center">
                <span className="text-[10px] font-medium text-ink-700 tabular-nums sm:text-xs">
                  <span className="sr-only">
                    {d.label}: {formatINR(d.amountPaise)}
                  </span>
                  <span aria-hidden="true">{formatINRCompact(d.amountPaise)}</span>
                </span>
                <span className="mt-1 flex w-full flex-1 items-end" aria-hidden="true">
                  <span
                    className={`block w-full rounded-t-md ${d.weekday >= 5 ? 'bg-series-2' : 'bg-series-1'}`}
                    style={{ height: `${Math.max((d.amountPaise / maxDay) * 100, 2)}%` }}
                  />
                </span>
                <span className="mt-1.5 text-xs text-ink-500" aria-hidden="true">
                  {d.label.slice(0, 3)}
                </span>
              </li>
            ))}
          </ol>
          <ul className="mt-3 flex gap-4 text-xs text-ink-700" aria-label="Legend">
            <li className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-series-1" />
              Weekdays
            </li>
            <li className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-series-2" />
              Weekends
            </li>
          </ul>
          <h3 className="mt-5 text-sm font-semibold">By week</h3>
          <ol className="mt-2 space-y-2">
            {p.weekly.map((w) => (
              <li
                key={w.weekStart}
                className="grid grid-cols-[6rem_1fr_6rem] items-center gap-2 text-sm"
              >
                <span className="text-ink-700">
                  From {formatDayKey(w.weekStart).replace(/ \d{4}$/, '')}
                </span>
                <span className="h-2 rounded-full bg-ink-100" aria-hidden="true">
                  <span
                    className="block h-full rounded-full bg-series-1"
                    style={{ width: `${(w.amountPaise / maxWeek) * 100}%` }}
                  />
                </span>
                <span className="text-right tabular-nums">{formatINR(w.amountPaise)}</span>
              </li>
            ))}
          </ol>
        </Card>

        <Card title="What else happened?" description="Largest payments, money back and transfers">
          <h3 className="text-sm font-semibold">Largest payments</h3>
          {p.largest.length === 0 ? (
            <p className="mt-2 text-sm text-ink-500">No payments this month.</p>
          ) : (
            <ul className="mt-2 divide-y divide-ink-100 text-sm">
              {p.largest.map((t) => (
                <li key={t.id} className="flex justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{t.merchantName ?? 'Unknown'}</span>
                    <span className="block text-xs text-ink-500">{formatDay(t.date)}</span>
                  </span>
                  <span className="font-medium tabular-nums">{formatINR(t.amountPaise)}</span>
                </li>
              ))}
            </ul>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {(
              [
                ['Refunds', p.refunds],
                ['Cashback', p.cashback],
                ['Transfers out', p.transfersOut],
                ['Transfers in', p.transfersIn],
              ] as const
            ).map(([name, t]) => (
              <div key={name} className="rounded-xl bg-ink-100/60 p-3">
                <dt className="text-xs text-ink-500">{name}</dt>
                <dd className="font-medium tabular-nums">
                  {formatINR(t.amountPaise)}
                  <span className="ml-1 text-xs font-normal text-ink-500">({t.count})</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-ink-700">
            {p.monthlyVolatility === null
              ? 'Spending volatility needs at least 3 months of data.'
              : `Monthly spending varies by about ${Math.round(p.monthlyVolatility * 100)}% over ${p.volatilityMonths} months.`}
          </p>
        </Card>
      </div>
    </>
  );
}
