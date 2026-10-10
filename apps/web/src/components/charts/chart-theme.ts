/** Shared chart styling: quiet axes, horizontal grid only, one tooltip look. */
export const chartTooltipClass =
  'rounded-xl border border-ink-200 bg-surface px-3 py-2 text-xs shadow-lg';

export const axisTick = { fill: 'var(--color-ink-500)', fontSize: 12 } as const;

export const gridStroke = 'var(--color-chart-grid)';

/** Ranking bars run from light to full blue by their share of the largest bar (0..1). */
export function rankColour(ratio: number): string {
  const pct = Math.round(35 + 65 * Math.min(1, Math.max(0, ratio)));
  return `color-mix(in srgb, var(--color-series-1) ${pct}%, #c7d7fe)`;
}
