import type { TransactionFlow, TransactionType } from '@moneylens/types';

// Hyphens are excluded: narrations use them as field separators around the handle.
const UPI_ID = /([a-z0-9][a-z0-9._]{1,63}@[a-z][a-z0-9]{1,30})\b/i;
// UPI RRNs and most bank references are 10-22 digits.
const REFERENCE = /\b(\d{10,22})\b/;

export function extractUpiId(description: string): string | null {
  const m = UPI_ID.exec(description);
  // Exclude e-mail-like domains such as "x@gmail.com": UPI handles have no dot after @.
  if (!m) return null;
  const after = description.slice((m.index ?? 0) + m[0].length);
  if (after.startsWith('.')) return null;
  return (m[1] as string).toLowerCase();
}

export function extractReference(description: string): string | null {
  return REFERENCE.exec(description)?.[1] ?? null;
}

/**
 * Infer the transaction type from its description and direction. Only clear,
 * conventional wording is used; everything else falls back to DEBIT/CREDIT by
 * direction, and the user can correct it in review.
 */
export function inferTransactionType(description: string, flow: TransactionFlow): TransactionType {
  const d = description.toUpperCase();
  if (/\b(SELF[\s-]?TRANSFER|OWN ACCOUNT|TO SELF|SWEEP)\b/.test(d)) return 'SELF_TRANSFER';
  if (flow === 'IN') {
    if (/\b(REFUND|REVERSAL|REVERSED|REV|CHARGEBACK)\b/.test(d)) return 'REFUND';
    if (/\b(CASHBACK|CASH BACK|REWARDS?)\b/.test(d)) return 'CASHBACK';
    return 'CREDIT';
  }
  return 'DEBIT';
}
