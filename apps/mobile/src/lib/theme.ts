import { chartSeries, colors as tokens, radii, spacing } from '@moneylens/ui';

/** React Native styles built from the shared design tokens (packages/ui). */
export const colors = {
  ...tokens,
  canvas: tokens.ink[50],
  surface: '#ffffff',
  border: tokens.ink[200],
  text: tokens.ink[900],
  textMuted: tokens.ink[500],
  textSoft: tokens.ink[700],
  primary: tokens.brand[600],
  primaryPressed: tokens.brand[700],
} as const;

export { radii, spacing };

/** Categories past this many share a neutral colour, like the web donut. */
export const COLOURED_CATEGORIES = 6;

export function categoryColour(index: number): string {
  return (index < COLOURED_CATEGORIES && chartSeries.light[index]) || tokens.ink[300];
}

/** Fixed slots: income is always slot 1, spending slot 2 (see packages/ui). */
export const seriesColour = {
  income: chartSeries.light[0],
  spending: chartSeries.light[1],
} as const;

export const toneColour = {
  good: tokens.positive,
  fair: tokens.warning,
  poor: tokens.negative,
  none: tokens.ink[500],
} as const;

export const shadow = {
  shadowColor: '#0f172a',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
} as const;

export const type = {
  hero: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5, color: colors.text },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.3, color: colors.text },
  heading: { fontSize: 17, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, lineHeight: 21, color: colors.text },
  small: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
  label: { fontSize: 12, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.3 },
} as const;
