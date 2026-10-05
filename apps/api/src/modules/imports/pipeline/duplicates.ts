import { dayKeyOf } from '@moneylens/shared';
import type { TransactionFlow } from '@moneylens/types';

/** What duplicate detection needs to know about a row or transaction. */
export interface DuplicateCandidate {
  date: Date;
  amountPaise: number;
  flow: TransactionFlow;
  reference: string | null;
  /** `merchantKey` of the resolved merchant, or null. */
  merchantKey: string | null;
  upiId: string | null;
}

export interface ExistingTransaction extends DuplicateCandidate {
  id: string;
}

export interface DuplicateMatch {
  /** Existing transaction id, or null for a repeat inside the same file. */
  duplicateOfId: string | null;
  reason: string;
}

/** Points needed to call a row a possible duplicate (see `scoreMatch`). */
export const DUPLICATE_THRESHOLD = 4;
const DAY_MS = 86_400_000;

function dayDistance(a: Date, b: Date): number {
  return Math.abs(Date.parse(dayKeyOf(a)) - Date.parse(dayKeyOf(b))) / DAY_MS;
}

/**
 * Score how alike a new row and an existing transaction are. The amount and
 * direction must match exactly; then the same IST day scores 3 (one day apart
 * scores 1, for statements that post the next day), the same merchant 3 and
 * the same UPI ID 3. Two different reference numbers mean two different
 * payments, however alike they look.
 */
export function scoreMatch(
  row: DuplicateCandidate,
  existing: DuplicateCandidate,
): { score: number; reasons: string[] } {
  if (row.reference && existing.reference) {
    return row.reference === existing.reference
      ? { score: 10, reasons: ['same reference number'] }
      : { score: 0, reasons: [] };
  }
  if (row.amountPaise !== existing.amountPaise || row.flow !== existing.flow) {
    return { score: 0, reasons: [] };
  }
  let score = 0;
  const reasons = ['same amount'];
  const days = dayDistance(row.date, existing.date);
  if (days === 0) {
    score += 3;
    reasons.push('same day');
  } else if (days === 1) {
    score += 1;
    reasons.push('one day apart');
  } else {
    return { score: 0, reasons: [] };
  }
  if (row.merchantKey && row.merchantKey === existing.merchantKey) {
    score += 3;
    reasons.push('same merchant');
  }
  if (row.upiId && row.upiId === existing.upiId) {
    score += 3;
    reasons.push('same UPI ID');
  }
  return { score, reasons };
}

function sentence(reasons: string[]): string {
  const text =
    reasons.length > 1 ? `${reasons.slice(0, -1).join(', ')} and ${reasons.at(-1)}` : reasons[0];
  return (text ?? '').replace(/^./, (c) => c.toUpperCase());
}

/**
 * Flag rows that probably repeat a transaction the user already has, or an
 * earlier row of the same file. Each existing transaction is matched at most
 * once, so two genuine ₹20 teas on the same day against one existing tea
 * flag only one row. Inside one file only identical reference numbers count:
 * a statement listing two equal payments means two payments.
 */
export function findDuplicates(
  rows: DuplicateCandidate[],
  existing: ExistingTransaction[],
): (DuplicateMatch | null)[] {
  const used = new Set<string>();
  const seenRefs = new Set<string>();
  return rows.map((row) => {
    if (row.reference) {
      if (seenRefs.has(row.reference)) {
        return {
          duplicateOfId: null,
          reason: 'Same reference number as an earlier row in this file',
        };
      }
      seenRefs.add(row.reference);
    }
    let best: { id: string; score: number; reasons: string[] } | null = null;
    for (const t of existing) {
      if (used.has(t.id)) continue;
      const { score, reasons } = scoreMatch(row, t);
      if (score >= DUPLICATE_THRESHOLD && (!best || score > best.score)) {
        best = { id: t.id, score, reasons };
      }
    }
    if (!best) return null;
    used.add(best.id);
    return {
      duplicateOfId: best.id,
      reason: `${sentence(best.reasons)} as a transaction you already have`,
    };
  });
}
