import type { ColumnMappingInput } from '@moneylens/validation';

/** Problems with a column choice, or null when it can be sent. */
export function mappingProblem(mapping: ColumnMappingInput): string | null {
  const c = mapping.columns;
  if (c.date === undefined) return 'Choose the date column.';
  if (c.description === undefined) return 'Choose the description column.';
  if (c.amount === undefined && c.debit === undefined && c.credit === undefined) {
    return 'Choose an amount column, or the money out and money in columns.';
  }
  const used = Object.values(c);
  if (new Set(used).size !== used.length) return 'Each column can be used once.';
  return null;
}
