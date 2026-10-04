import type { AnalyticsTransaction } from '@moneylens/types';

export type FlowClass = 'spend' | 'income' | 'refund' | 'cashback' | 'excluded';

/**
 * Decide how a transaction contributes to income and spending.
 *
 * - DEBIT, and TRANSFER out to someone else, are spending.
 * - CREDIT, and TRANSFER in from someone else, are income.
 * - REFUND reduces spending; CASHBACK is reported separately.
 * - SELF_TRANSFER moves money between the user's own accounts and is excluded.
 * - UNKNOWN follows its flow so that money is never silently dropped.
 */
export function classifyTransaction(tx: Pick<AnalyticsTransaction, 'type' | 'flow'>): FlowClass {
  switch (tx.type) {
    case 'DEBIT':
      return tx.flow === 'OUT' ? 'spend' : 'excluded';
    case 'CREDIT':
      return tx.flow === 'IN' ? 'income' : 'excluded';
    case 'TRANSFER':
    case 'UNKNOWN':
      return tx.flow === 'OUT' ? 'spend' : 'income';
    case 'REFUND':
      return 'refund';
    case 'CASHBACK':
      return 'cashback';
    case 'SELF_TRANSFER':
      return 'excluded';
  }
}

export function isSpend(tx: Pick<AnalyticsTransaction, 'type' | 'flow'>): boolean {
  return classifyTransaction(tx) === 'spend';
}
