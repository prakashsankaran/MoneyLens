import { $Enums } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  PAYMENT_METHODS,
  PROVENANCE_KINDS,
  TRANSACTION_FLOWS,
  TRANSACTION_SOURCES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from '@moneylens/types';

// The shared types package mirrors the Prisma enums; this guards against drift.
describe('shared enums match the database schema', () => {
  it.each([
    ['TransactionType', TRANSACTION_TYPES, $Enums.TransactionType],
    ['TransactionFlow', TRANSACTION_FLOWS, $Enums.TransactionFlow],
    ['TransactionSource', TRANSACTION_SOURCES, $Enums.TransactionSource],
    ['TransactionStatus', TRANSACTION_STATUSES, $Enums.TransactionStatus],
    ['PaymentMethod', PAYMENT_METHODS, $Enums.PaymentMethod],
    ['InsightKind', PROVENANCE_KINDS, $Enums.InsightKind],
  ])('%s', (_name, shared, prisma) => {
    expect([...shared].sort()).toEqual(Object.values(prisma).sort());
  });
});
