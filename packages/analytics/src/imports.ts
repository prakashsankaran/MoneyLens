import { dayKeyOf } from '@moneylens/shared';
import type { ImportRowDecision, ImportStats, TransactionFlow } from '@moneylens/types';

export interface ImportStatsRow {
  date: Date;
  amountPaise: number;
  flow: TransactionFlow;
  decision: ImportRowDecision;
  categoryId: string | null;
}

/**
 * Summary shown before the user confirms an import. Debit and credit totals
 * cover the rows that will be imported (decision INCLUDE); the date range
 * covers every row detected in the file.
 */
export function importStats(rows: readonly ImportStatsRow[]): ImportStats {
  let included = 0;
  let excluded = 0;
  let possibleDuplicates = 0;
  let uncategorized = 0;
  let debits = 0;
  let credits = 0;
  let first: Date | null = null;
  let last: Date | null = null;

  for (const row of rows) {
    if (!first || row.date < first) first = row.date;
    if (!last || row.date > last) last = row.date;

    if (row.decision === 'DUPLICATE') possibleDuplicates += 1;
    if (row.decision !== 'INCLUDE') {
      excluded += 1;
      continue;
    }
    included += 1;
    if (!row.categoryId) uncategorized += 1;
    if (row.flow === 'OUT') debits += row.amountPaise;
    else credits += row.amountPaise;
  }

  return {
    detected: rows.length,
    included,
    excluded,
    possibleDuplicates,
    uncategorized,
    firstDate: first ? dayKeyOf(first) : null,
    lastDate: last ? dayKeyOf(last) : null,
    totalDebitsPaise: debits,
    totalCreditsPaise: credits,
  };
}
