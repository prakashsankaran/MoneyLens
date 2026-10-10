import { useState } from 'react';
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
import { axisTick, chartTooltipClass, gridStroke } from '../../../components/charts/chart-theme';
import { formatINR, formatINRCompact, formatMonthKey } from '@moneylens/shared';
import type { MonthlyTrendPoint } from '@moneylens/types';

const SERIES = [
  { key: 'incomePaise', label: 'Income', color: 'var(--color-series-1)' },
  { key: 'spendingPaise', label: 'Spending', color: 'var(--color-series-2)' },
] as const;

function TrendTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  return (
    <div className={chartTooltipClass}>
      <p className="mb-1 font-semibold text-ink-900">{formatMonthKey(String(label))}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-ink-700">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-medium tabular-nums">{formatINR(Number(p.value))}</span>
        </p>
      ))}
    </div>
  );
}

/** Six months of income and spending, with an accessible table alternative. */
export function SpendingTrendChart({ trend }: { trend: MonthlyTrendPoint[] }) {
  const [showTable, setShowTable] = useState(false);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex gap-4 text-xs text-ink-700" aria-label="Legend">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="h-1 w-3.5 rounded-full" style={{ background: s.color }} />
              {s.label}
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
                <th className="py-2 font-semibold">Month</th>
                <th className="py-2 text-right font-semibold">Income</th>
                <th className="py-2 text-right font-semibold">Spending</th>
                <th className="py-2 text-right font-semibold">Saved</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {trend.map((t) => (
                <tr key={t.month} className="border-b border-ink-100 last:border-0">
                  <td className="py-2">{formatMonthKey(t.month)}</td>
                  <td className="py-2 text-right">{formatINR(t.incomePaise)}</td>
                  <td className="py-2 text-right">{formatINR(t.spendingPaise)}</td>
                  <td className="py-2 text-right">{formatINR(t.savedPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="h-64"
          role="img"
          aria-label={`Income and spending for ${trend.map((t) => formatMonthKey(t.month)).join(', ')}. Use "Show as table" for exact values.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend} barGap={2} barCategoryGap="28%" margin={{ left: 0, right: 4 }}>
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
              <Tooltip content={TrendTooltip} cursor={{ fill: 'var(--color-ink-100)' }} />
              {SERIES.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color}
                  radius={[6, 6, 0, 0]}
                  animationDuration={700}
                  animationEasing="ease-out"
                  maxBarSize={22}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
