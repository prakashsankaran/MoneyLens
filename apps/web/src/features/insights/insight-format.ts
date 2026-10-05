import { formatINR } from '@moneylens/shared';
import type { Insight } from '@moneylens/types';

/** "High (85%)": how strongly the data supports the finding. */
export function confidenceLabel(confidence: number): string {
  const pct = Math.round(confidence * 100);
  const word = confidence >= 0.8 ? 'High' : confidence >= 0.6 ? 'Medium' : 'Low';
  return `${word} (${pct}%)`;
}

export function metricText(metric: Insight['metric']): string {
  if (metric.valuePaise !== undefined) return formatINR(metric.valuePaise);
  if (metric.value === undefined) return '';
  const value = Number(metric.value.toFixed(2));
  return metric.unit === '%' ? `${value}%` : `${value}${metric.unit ?? ''}`;
}
