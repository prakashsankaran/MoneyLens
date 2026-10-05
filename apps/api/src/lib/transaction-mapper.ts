import type { Prisma } from '@prisma/client';
import { maskIdentifiersInText, maskTail, maskUpiId } from '@moneylens/shared';
import type { TransactionDetail, TransactionItem } from '@moneylens/types';
import { decimalToPaise } from './money';

const categoryLabel = { select: { id: true, name: true, slug: true } } as const;

export const transactionInclude = {
  category: categoryLabel,
  subcategory: categoryLabel,
} satisfies Prisma.TransactionInclude;

export const transactionDetailInclude = {
  ...transactionInclude,
  sourceFile: { select: { id: true, originalFilename: true } },
} satisfies Prisma.TransactionInclude;

type Row = Prisma.TransactionGetPayload<{ include: typeof transactionInclude }>;
type DetailRow = Prisma.TransactionGetPayload<{ include: typeof transactionDetailInclude }>;

/**
 * API shape of a transaction. UPI IDs and references are masked: they are kept
 * for duplicate detection, not for display.
 */
export function toTransactionItem(t: Row): TransactionItem {
  return {
    id: t.id,
    date: t.transactionDate.toISOString(),
    amountPaise: decimalToPaise(t.amount),
    currency: t.currency,
    type: t.transactionType,
    flow: t.flow,
    merchantId: t.merchantId,
    merchantName: t.merchantName,
    description: maskIdentifiersInText(t.description),
    category: t.category,
    subcategory: t.subcategory,
    paymentMethod: t.paymentMethod,
    source: t.source,
    status: t.status,
    isRecurring: t.isRecurring,
    notes: t.notes,
    upiIdMasked: maskUpiId(t.upiId),
    referenceMasked: maskTail(t.transactionReference),
    categoryConfidence: t.categoryConfidence,
  };
}

export function toTransactionDetail(t: DetailRow): TransactionDetail {
  return {
    ...toTransactionItem(t),
    sourceFile: t.sourceFile
      ? { id: t.sourceFile.id, filename: t.sourceFile.originalFilename }
      : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
