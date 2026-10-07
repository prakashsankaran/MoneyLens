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

const SAVING_PREFIX = 'Potential saving opportunity: ';

/** Moves the long "Potential saving opportunity:" prefix out of the headline into a tag. */
export function displayTitle(title: string): { title: string; savingIdea: boolean } {
  if (!title.startsWith(SAVING_PREFIX)) return { title, savingIdea: false };
  const rest = title.slice(SAVING_PREFIX.length);
  return { title: rest.charAt(0).toUpperCase() + rest.slice(1), savingIdea: true };
}
