export type ScoreTone = 'good' | 'fair' | 'poor' | 'none';

/** Health-style bands: 75+ good, 50+ fair, below that needs work. */
export function toneForScore(score: number | null): ScoreTone {
  if (score === null) return 'none';
  if (score >= 75) return 'good';
  if (score >= 50) return 'fair';
  return 'poor';
}

export const TONE_LABEL: Record<ScoreTone, string> = {
  good: 'Good',
  fair: 'Fair',
  poor: 'Needs work',
  none: 'Not enough data',
};

export const TONE_TEXT: Record<ScoreTone, string> = {
  good: 'text-positive',
  fair: 'text-warning',
  poor: 'text-negative',
  none: 'text-ink-500',
};
