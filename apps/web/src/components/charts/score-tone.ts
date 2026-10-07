import type { ScoreTone } from '@moneylens/shared';

export { toneForScore, TONE_LABEL, type ScoreTone } from '@moneylens/shared';

export const TONE_TEXT: Record<ScoreTone, string> = {
  good: 'text-positive',
  fair: 'text-warning',
  poor: 'text-negative',
  none: 'text-ink-500',
};
