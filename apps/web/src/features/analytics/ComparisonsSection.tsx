import { formatINR } from '@moneylens/shared';
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
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <thead className="text-left text-xs text-ink-500">
              <tr>
                <th scope="col" className="px-2 pb-2 font-medium">
                  Compared with
                </th>
                <th scope="col" className="px-2 pb-2 text-right font-medium">
                  This period
                </th>
                <th scope="col" className="px-2 pb-2 text-right font-medium">
                  Then
                </th>
                <th scope="col" className="px-2 pb-2 text-right font-medium">
                  Change
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {data.totals.map((r) => (
                <tr key={r.baseline}>
                  <td className="px-2 py-2">
                    <span className="font-medium">{r.label}</span>
                    {r.baselineMonths > 0 && r.baseline.startsWith('avg') && (
                      <span className="block text-xs text-ink-500">
                        Average of {r.baselineMonths} {r.baselineMonths === 1 ? 'month' : 'months'}{' '}
                        with data
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatINR(r.currentPaise)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {r.baselineMonths === 0 ? '–' : formatINR(r.baselinePaise)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{changeText(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
          <ol className="space-y-2">
            {p.byWeekday.map((d) => (
              <li
                key={d.weekday}
                className="grid grid-cols-[6rem_1fr_6rem] items-center gap-2 text-sm"
              >
                <span>{d.label}</span>
                <span className="h-2 rounded-full bg-ink-100" aria-hidden="true">
                  <span
                    className={`block h-full rounded-full ${d.weekday >= 5 ? 'bg-series-2' : 'bg-series-1'}`}
                    style={{ width: `${(d.amountPaise / maxDay) * 100}%` }}
                  />
                </span>
                <span className="text-right tabular-nums">{formatINR(d.amountPaise)}</span>
              </li>
            ))}
          </ol>
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
          <p className="mt-4 text-sm">
            {p.monthlyVolatility === null
              ? 'Spending volatility needs at least 3 months of data.'
              : `Monthly spending varies by about ${Math.round(p.monthlyVolatility * 100)}% across the last ${p.volatilityMonths} months (coefficient of variation ${p.monthlyVolatility}).`}
          </p>
        </Card>
      </div>
    </>
  );
}
