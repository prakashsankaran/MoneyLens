import type { ReactNode } from 'react';
import { Cell, Pie, PieChart, Tooltip, type TooltipContentProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { formatINR } from '@moneylens/shared';

export interface DonutSlice {
  key: string;
  label: string;
  /** Amount in paise. */
  value: number;
  color: string;
}

function SliceTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const p = payload?.[0];
  if (!active || !p) return null;
  return (
    <div className="rounded-xl border border-ink-200/70 bg-surface px-3 py-2 text-xs shadow-sm">
      <p className="flex items-center gap-2 text-ink-700">
        <span
          className="size-2 rounded-full"
          style={{ background: (p.payload as DonutSlice).color }}
        />
        {p.name}: <span className="font-medium tabular-nums">{formatINR(Number(p.value))}</span>
      </p>
    </div>
  );
}

/**
 * A donut with the headline figure in its hole. Slices are separated by a
 * thin surface-coloured gap; the caller shows a labelled legend beside it,
 * so colour is never the only way to tell slices apart.
 */
export function DonutChart({
  slices,
  size = 200,
  center,
  label,
}: {
  slices: DonutSlice[];
  size?: number;
  center: ReactNode;
  /** Text alternative for the whole chart. */
  label: string;
}) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div role="img" aria-label={label}>
        <PieChart width={size} height={size}>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="label"
            innerRadius="68%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            stroke="var(--color-surface)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {slices.map((s) => (
              <Cell key={s.key} fill={s.color} />
            ))}
          </Pie>
          <Tooltip content={SliceTooltip} />
        </PieChart>
      </div>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {center}
      </div>
    </div>
  );
}
