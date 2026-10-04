/** Integer-safe statistics helpers. Inputs are integer paise. */

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Mean rounded to the nearest paisa; 0 for an empty list. */
export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.round(sum(values) / values.length);
}

/** Median rounded to the nearest paisa; 0 for an empty list. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return Math.round(((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2);
}
