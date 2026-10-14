import { useState } from 'react';
import type { IconType } from 'react-icons';
import {
  LuArrowDownLeft,
  LuArrowLeftRight,
  LuCalendarDays,
  LuChartColumn,
  LuChartColumnStacked,
  LuChartPie,
  LuListChecks,
  LuPiggyBank,
  LuStore,
  LuWallet,
} from 'react-icons/lu';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import {
  formatINR,
  formatINRCompact,
  formatMonthKey,
  monthDayRange,
  pctDelta,
  savingsRateTone,
  type Delta,
  type DeltaTone,
} from '@moneylens/shared';
import type { PeriodAnalytics } from '@moneylens/types';
import { Card } from '../../components/Card';
import { ScoreRing } from '../../components/charts/ScoreRing';
import { axisTick, chartTooltipClass, gridStroke } from '../../components/charts/chart-theme';
import { categoryColour, OTHER_COLOUR } from '../../lib/category-colors';
import { formatDay } from '../../lib/format';
import { SpendingTrendChart } from '../dashboard/components/SpendingTrendChart';
import { CategoryList, MerchantBars } from './AnalyticsLists';
import { formatRange, rangeLength } from './periods';

const pillClass: Record<DeltaTone, string> = {
  good: 'bg-positive-50 text-positive',
  bad: 'bg-negative-50 text-negative',
  neutral: 'bg-ink-100 text-ink-700',
};

function DeltaPill({ delta }: { delta: Delta }) {
  return (
    <span
      className={`inline-flex min-h-6 items-center rounded-xl px-2.5 py-0.5 text-xs leading-tight font-semibold ${pillClass[delta.tone]}`}
    >
      {delta.text}
    </span>
  );
}

/** "last year", "the previous 3 months" or "the previous 92 days". */
function comparedWith(data: PeriodAnalytics): string {
  if (data.previous.compare === 'lastYear') return 'last year';
  return `previous ${rangeLength(data.previous.from, data.previous.to).replace(/^1 (\w+)$/, '$1')}`;
}

/** Everything about a longer period: totals, averages, trends, categories and habits. */
export function PeriodView({ data }: { data: PeriodAnalytics }) {
  const [parent, setParent] = useState<{ id: string; name: string } | null>(null);
  const range = formatRange(data.from, data.to);
  const versus = comparedWith(data);
  const txLink = (extra: string) => `/transactions?from=${data.from}&to=${data.to}&${extra}`;
  const subItems = parent ? (data.subcategories[parent.id] ?? []) : null;

  return (
    <div className="space-y-4 md:space-y-6">
      <p className="text-sm text-ink-700">
        <span className="font-semibold text-ink-900">{range}</span>
        <span className="text-ink-500"> · {rangeLength(data.from, data.to)}</span>
        {data.previous.hasData ? (
          <span className="text-ink-500">
            {' '}
            · compared with {formatRange(data.previous.from, data.previous.to)}
          </span>
        ) : (
          <span className="text-ink-500">
            {' '}
            · no data for {formatRange(data.previous.from, data.previous.to)} to compare with
          </span>
        )}
      </p>

      {data.monthsWithData === 0 ? (
        <Card title="No transactions in this period">
          <p className="text-sm text-ink-500">
            Your imported data covers{' '}
            {formatRange(
              monthDayRange(data.availableMonths[0] ?? data.from.slice(0, 7)).from,
              monthDayRange(data.availableMonths.at(-1) ?? data.to.slice(0, 7)).to,
            )}
            . Choose another period.
          </p>
        </Card>
      ) : (
        <>
          {(data.monthsWithData < data.months.length ||
            (data.previous.hasData && data.previous.monthsWithData < data.previous.months)) && (
            <div
              role="note"
              className="space-y-1 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-700"
            >
              {data.monthsWithData < data.months.length && (
                <p>
                  Your imports cover {data.monthsWithData} of the {data.months.length} months in
                  this period. Monthly averages use only the months with data.
                </p>
              )}
              {data.previous.hasData && data.previous.monthsWithData < data.previous.months && (
                <p>
                  For {formatRange(data.previous.from, data.previous.to)}, only{' '}
                  {data.previous.monthsWithData} of its {data.previous.months} months have data, so
                  the changes shown may look bigger than they are.
                </p>
              )}
            </div>
          )}

          <PeriodTiles data={data} versus={versus} />
          <Highlights data={data} />

          <Card
            title="How did each month go?"
            icon={LuChartColumn}
            description={
              data.wholeMonths
                ? 'Income and spending per month'
                : 'Income and spending per month; the first and last months are partial'
            }
          >
            <SpendingTrendChart trend={data.trend} />
          </Card>

          <div className="list-rise grid gap-4 lg:grid-cols-5 lg:gap-6">
            <Card
              className="lg:col-span-3"
              icon={LuChartPie}
              title={parent ? `What made up ${parent.name}?` : `Where did my money go in ${range}?`}
              description={
                parent
                  ? 'Subcategories, after refunds'
                  : 'Select a category to see its subcategories'
              }
              action={
                parent && (
                  <button
                    type="button"
                    onClick={() => setParent(null)}
                    className="shrink-0 text-sm font-medium text-brand-700 hover:underline underline-offset-4 hover:text-brand-800 transition-all duration-200"
                  >
                    All categories
                  </button>
                )
              }
            >
              <CategoryList
                items={subItems ?? data.categories}
                drillable={!parent}
                onSelect={(item) =>
                  item.categoryId && setParent({ id: item.categoryId, name: item.name })
                }
                linkFor={(item) => txLink(`categoryId=${item.categoryId ?? 'uncategorized'}`)}
              />
            </Card>

            <Card
              className="lg:col-span-2"
              title="Who did I pay most?"
              icon={LuStore}
              description="Top 10 merchants over the period"
            >
              {data.merchants.length > 0 ? (
                <MerchantBars
                  items={data.merchants}
                  linkFor={(merchantId) => txLink(`merchantId=${merchantId}`)}
                />
              ) : (
                <p className="text-sm text-ink-500">No merchant payments in this period.</p>
              )}
            </Card>
          </div>

          {data.categoryTrend.series.length > 0 && (
            <Card
              title="How did my categories change month by month?"
              icon={LuChartColumnStacked}
              description="Spending in the top categories each month, after refunds"
            >
              <CategoryTrendChart trend={data.categoryTrend} />
            </Card>
          )}

          <div className="list-rise grid gap-4 lg:grid-cols-2 lg:gap-6">
            <CategoryChanges data={data} versus={versus} />
            <IncomeSources data={data} />
          </div>

          <div className="list-rise grid gap-4 lg:grid-cols-2 lg:gap-6">
            <WeekdayCard data={data} />
            <OtherActivity data={data} />
          </div>
        </>
      )}
    </div>
  );
}

function TileIcon({ icon: Icon }: { icon: IconType }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-700">
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

/** Spending as the big number with its change, the savings rate ring, income and savings. */
function PeriodTiles({ data, versus }: { data: PeriodAnalytics; versus: string }) {
  const { totals } = data;
  const rate = totals.savingsRatePct;
  const overspent = totals.savedPaise < 0;
  const rateText = rate === null ? '—' : rate < -999 ? '< −999%' : `${Math.round(rate)}%`;
  const spendingDelta = pctDelta(data.spendingChangePct, versus, false);
  const incomeDelta = pctDelta(data.incomeChangePct, versus, true);
  const savedDelta: Delta | undefined =
    data.savedChangePaise !== null && data.savedChangePaise !== 0
      ? {
          text: `${data.savedChangePaise > 0 ? '▲' : '▼'} ${formatINR(Math.abs(data.savedChangePaise))} vs ${versus}`,
          tone: data.savedChangePaise > 0 ? 'good' : 'bad',
        }
      : undefined;

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
              {totals.spendTransactionCount} payments
              {totals.refundsPaise > 0 && `, after ${formatINR(totals.refundsPaise)} in refunds`}
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

/** Averages and the highest and lowest months, as four small headline numbers. */
function Highlights({ data }: { data: PeriodAnalytics }) {
  const items: { label: string; value: string; note: string }[] = [
    {
      label: 'Spent per month',
      value: formatINR(data.averages.monthlySpendingPaise),
      note: `Income ${formatINR(data.averages.monthlyIncomePaise)} a month`,
    },
    {
      label: 'Spent per day',
      value: formatINR(data.averages.dailySpendingPaise),
      note: `Average payment ${formatINR(data.totals.averageSpendPaise)}`,
    },
  ];
  if (data.highestMonth) {
    items.push({
      label: 'Highest month',
      value: formatINR(data.highestMonth.spendingPaise),
      note: formatMonthKey(data.highestMonth.month),
    });
  }
  if (data.lowestMonth) {
    items.push({
      label: 'Lowest month',
      value: formatINR(data.lowestMonth.spendingPaise),
      note: formatMonthKey(data.lowestMonth.month),
    });
  }
  return (
    <dl className="list-rise grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4 lg:gap-6">
      {items.map((i) => (
        <div
          key={i.label}
          className="min-w-0 rounded-2xl border border-ink-200 bg-surface p-4 shadow-card sm:p-5"
        >
          <dt className="text-xs font-medium text-ink-500">{i.label}</dt>
          <dd className="mt-1.5 text-xl font-bold tracking-tight [overflow-wrap:anywhere] sm:text-2xl">
            {i.value}
          </dd>
          <dd className="mt-1 text-xs text-ink-500">{i.note}</dd>
        </div>
      ))}
    </dl>
  );
}

function CategoryTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  return (
    <div className={chartTooltipClass}>
      <p className="mb-1 font-semibold text-ink-900">{formatMonthKey(String(label))}</p>
      {[...payload].reverse().map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-ink-700">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-medium tabular-nums">{formatINR(Number(p.value))}</span>
        </p>
      ))}
    </div>
  );
}

/** Stacked monthly columns for the top categories, with a table alternative. */
function CategoryTrendChart({ trend }: { trend: PeriodAnalytics['categoryTrend'] }) {
  const [showTable, setShowTable] = useState(false);
  const colourOf = (key: string, i: number) => (key === 'other' ? OTHER_COLOUR : categoryColour(i));
  const rows = trend.points.map((p) => ({ month: p.month, ...p.values }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-700" aria-label="Legend">
          {trend.series.map((s, i) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: colourOf(s.key, i) }} />
              {s.name}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="text-xs font-medium text-brand-700 hover:underline underline-offset-4 hover:text-brand-800 transition-all duration-200"
        >
          {showTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>
      {showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs tracking-[.04em] text-ink-500 uppercase">
                <th className="py-2 pr-3 font-semibold">Month</th>
                {trend.series.map((s) => (
                  <th key={s.key} className="py-2 pl-3 text-right font-semibold whitespace-nowrap">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {trend.points.map((p) => (
                <tr key={p.month} className="border-b border-ink-100 last:border-0">
                  <td className="py-2 pr-3 whitespace-nowrap">{formatMonthKey(p.month)}</td>
                  {trend.series.map((s) => (
                    <td key={s.key} className="py-2 pl-3 text-right">
                      {formatINR(p.values[s.key] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="h-64"
          role="img"
          aria-label={`Spending by category for each month: ${trend.series.map((s) => s.name).join(', ')}. Use "Show as table" for exact values.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} barCategoryGap="24%" margin={{ left: 0, right: 4 }}>
              <CartesianGrid vertical={false} stroke={gridStroke} />
              <XAxis
                dataKey="month"
                tickFormatter={(m: string) => formatMonthKey(m, { short: true })}
                tickLine={false}
                axisLine={false}
                tick={axisTick}
              />
              <YAxis
                tickFormatter={(v: number) => formatINRCompact(v)}
                tickLine={false}
                axisLine={false}
                width={52}
                tick={axisTick}
              />
              <Tooltip content={CategoryTooltip} cursor={{ fill: 'var(--color-ink-100)' }} />
              {trend.series.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  stackId="spend"
                  fill={colourOf(s.key, i)}
                  maxBarSize={36}
                  isAnimationActive={false}
                  radius={i === trend.series.length - 1 ? [6, 6, 0, 0] : 0}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/** The categories that moved most against the comparison period, as up/down bars. */
function CategoryChanges({ data, versus }: { data: PeriodAnalytics; versus: string }) {
  const rows = data.categoryChanges;
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.changePaise)));
  return (
    <Card
      title="What changed the most?"
      icon={LuArrowLeftRight}
      description={`Category spending against the ${versus}`}
    >
      {!data.previous.hasData ? (
        <p className="text-sm text-ink-500">
          There is no data for {formatRange(data.previous.from, data.previous.to)} to compare with.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-500">Spending by category did not change.</p>
      ) : (
        <ol className="space-y-3.5">
          {rows.map((r) => {
            const up = r.changePaise > 0;
            return (
              <li key={r.categoryId ?? r.slug}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">{r.name}</span>
                  <span
                    className={`shrink-0 font-semibold tabular-nums ${up ? 'text-negative' : 'text-positive'}`}
                  >
                    {up ? '▲' : '▼'} {formatINR(Math.abs(r.changePaise))}
                    {r.changePct !== null && (
                      <span className="ml-1 text-xs font-medium">
                        ({Math.abs(Math.round(r.changePct))}%)
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-ink-100" aria-hidden="true">
                  <div
                    className={`h-full rounded-full ${up ? 'bg-negative' : 'bg-positive'}`}
                    style={{ width: `${Math.max((Math.abs(r.changePaise) / max) * 100, 2)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-ink-500 tabular-nums">
                  {formatINR(r.previousPaise)} → {formatINR(r.currentPaise)}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

function IncomeSources({ data }: { data: PeriodAnalytics }) {
  const max = Math.max(1, ...data.incomeSources.map((s) => s.amountPaise));
  return (
    <Card title="Where did my income come from?" icon={LuArrowDownLeft} description="Top sources">
      {data.incomeSources.length === 0 ? (
        <p className="text-sm text-ink-500">No named income sources in this period.</p>
      ) : (
        <ol className="space-y-3">
          {data.incomeSources.map((s) => (
            <li key={s.merchantId ?? s.name}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">{s.name}</span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatINR(s.amountPaise)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-2.5 flex-1 rounded-full bg-ink-100" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-series-1"
                    style={{ width: `${Math.max((s.amountPaise / max) * 100, 2)}%` }}
                  />
                </div>
                <span className="w-20 shrink-0 text-right text-xs whitespace-nowrap text-ink-500">
                  {s.transactionCount} {s.transactionCount === 1 ? 'payment' : 'payments'}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function WeekdayCard({ data }: { data: PeriodAnalytics }) {
  const p = data.patterns;
  const maxDay = Math.max(1, ...p.byWeekday.map((d) => d.amountPaise));
  return (
    <Card
      title="When do I spend?"
      icon={LuCalendarDays}
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
      <p className="mt-4 text-sm text-ink-700">
        {p.monthlyVolatility === null
          ? 'How steady your spending is needs at least 3 full months of data.'
          : `Your monthly spending varied by about ${Math.round(p.monthlyVolatility * 100)}% from month to month.`}
      </p>
    </Card>
  );
}

function OtherActivity({ data }: { data: PeriodAnalytics }) {
  const p = data.patterns;
  return (
    <Card
      title="What were the biggest payments?"
      icon={LuListChecks}
      description="Plus money back and transfers"
    >
      {p.largest.length === 0 ? (
        <p className="text-sm text-ink-500">No payments in this period.</p>
      ) : (
        <ul className="divide-y divide-ink-100 text-sm">
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
    </Card>
  );
}
