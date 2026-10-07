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
import { formatINR, formatINRCompact, formatMonthKey } from '@moneylens/shared';
import type { MonthlyTrendPoint } from '@moneylens/types';

const SERIES = [
  { key: 'incomePaise', label: 'Income', color: 'var(--color-series-1)' },
  { key: 'spendingPaise', label: 'Spending', color: 'var(--color-series-2)' },
] as const;

function TrendTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-ink-200/70 bg-surface px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium">{formatMonthKey(String(label))}</p>
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
              <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="text-xs font-medium text-brand-600 hover:underline underline-offset-4 hover:text-brand-700 transition-all duration-200"
        >
          {showTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      {showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs text-ink-500">
                <th className="py-2 font-medium">Month</th>
                <th className="py-2 text-right font-medium">Income</th>
                <th className="py-2 text-right font-medium">Spending</th>
                <th className="py-2 text-right font-medium">Saved</th>
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
              <CartesianGrid vertical={false} stroke="var(--color-ink-100)" />
              <XAxis
                dataKey="month"
                tickFormatter={(m: string) => formatMonthKey(m, { short: true })}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-ink-300)' }}
                tick={{ fill: 'var(--color-ink-500)', fontSize: 12 }}
              />
              <YAxis
                tickFormatter={(v: number) => formatINRCompact(v)}
                tickLine={false}
                axisLine={false}
                width={52}
                tick={{ fill: 'var(--color-ink-500)', fontSize: 12 }}
              />
              <Tooltip
                content={TrendTooltip}
                cursor={{ fill: 'var(--color-ink-100)', opacity: 0.6 }}
              />
              {SERIES.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color}
                  radius={[4, 4, 0, 0]}
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
