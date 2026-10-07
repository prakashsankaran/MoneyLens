import { chartSeries } from '@moneylens/ui';

/** Categories past this many share the neutral "everything else" colour. */
export const COLOURED_CATEGORIES = 6;
export const OTHER_COLOUR = 'var(--color-ink-300)';

/**
 * Colour for the category at `index` in a list ranked by spending. The first
 * six take the chart palette in its fixed order; the rest are neutral, so a
 * donut never needs more hues than a reader can tell apart. Every chart that
 * uses these colours also labels each slice by name.
 */
export function categoryColour(index: number): string {
  return (index < COLOURED_CATEGORIES && chartSeries.light[index]) || OTHER_COLOUR;
}
