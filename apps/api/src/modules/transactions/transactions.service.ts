import type { Prisma, PrismaClient, TransactionFlow, TransactionType } from '@prisma/client';
import { summarizePeriod } from '@moneylens/analytics';
import { dayRangeUtc } from '@moneylens/shared';
import type { TransactionDetail, TransactionList, TransactionUpdateResult } from '@moneylens/types';
import type { TransactionQuery, UpdateTransactionInput } from '@moneylens/validation';
import { resolveCategoryAssignment } from '../../lib/categories';
import { notFound, AppError } from '../../lib/errors';
import { findOrCreateMerchant } from '../../lib/merchants';
import { decimalToPaise } from '../../lib/money';
import {
  toTransactionDetail,
  toTransactionItem,
  transactionDetailInclude,
  transactionInclude,
} from '../../lib/transaction-mapper';
import { ignoreChanges, type TransactionsChanged } from '../../lib/change-hooks';

/** Special category filter value for transactions without a category. */
export const UNCATEGORIZED_FILTER = 'uncategorized';

const SORTS: Record<TransactionQuery['sort'], Prisma.TransactionOrderByWithRelationInput[]> = {
  date_desc: [{ transactionDate: 'desc' }, { id: 'desc' }],
  date_asc: [{ transactionDate: 'asc' }, { id: 'asc' }],
  amount_desc: [{ amount: 'desc' }, { transactionDate: 'desc' }],
  amount_asc: [{ amount: 'asc' }, { transactionDate: 'desc' }],
};

/** Changing the type of a transaction keeps its direction consistent. */
export const FLOW_FOR_TYPE: Partial<Record<TransactionType, TransactionFlow>> = {
  DEBIT: 'OUT',
  CREDIT: 'IN',
  REFUND: 'IN',
  CASHBACK: 'IN',
};

export function buildTransactionWhere(
  userId: string,
  q: TransactionQuery,
): Prisma.TransactionWhereInput {
  const and: Prisma.TransactionWhereInput[] = [{ userId, status: q.status }];

  if (q.from || q.to) {
    and.push({
      transactionDate: {
        ...(q.from ? { gte: dayRangeUtc(q.from).start } : {}),
        ...(q.to ? { lt: dayRangeUtc(q.to).end } : {}),
      },
    });
  }
  if (q.categoryId === UNCATEGORIZED_FILTER) {
    and.push({ categoryId: null });
  } else if (q.categoryId) {
    and.push({ OR: [{ categoryId: q.categoryId }, { subcategoryId: q.categoryId }] });
  }
  if (q.merchantId) and.push({ merchantId: q.merchantId });
  if (q.minAmount) and.push({ amount: { gte: q.minAmount } });
  if (q.maxAmount) and.push({ amount: { lte: q.maxAmount } });
  if (q.type?.length) and.push({ transactionType: { in: q.type } });
  if (q.flow) and.push({ flow: q.flow });
  if (q.recurring) and.push({ isRecurring: q.recurring === 'true' });
  if (q.ids) and.push({ id: { in: q.ids } });
  if (q.source?.length) and.push({ source: { in: q.source } });
  if (q.q) {
    const contains = { contains: q.q, mode: 'insensitive' as const };
    and.push({
      OR: [{ merchantName: contains }, { description: contains }, { notes: contains }],
    });
  }
  return { AND: and };
}

export class TransactionsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly onChange: TransactionsChanged = ignoreChanges,
  ) {}

  async list(userId: string, q: TransactionQuery): Promise<TransactionList> {
    const where = buildTransactionWhere(userId, q);
    const [rows, total, all] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: transactionInclude,
        orderBy: SORTS[q.sort],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.transaction.count({ where }),
      // Totals cover every match, not just this page; only the columns the
      // engine needs are read.
      this.prisma.transaction.findMany({
        where,
        select: {
          id: true,
          transactionDate: true,
          amount: true,
          transactionType: true,
          flow: true,
        },
      }),
    ]);

    const summary = summarizePeriod(
      all.map((t) => ({
        id: t.id,
        date: t.transactionDate,
        amountPaise: decimalToPaise(t.amount),
        type: t.transactionType,
        flow: t.flow,
        merchantId: null,
        merchantName: null,
        categoryId: null,
      })),
    );

    return {
      items: rows.map(toTransactionItem),
      page: q.page,
      pageSize: q.pageSize,
      total,
      summary,
    };
  }

  async get(userId: string, id: string): Promise<TransactionDetail> {
    const row = await this.prisma.transaction.findFirst({
      where: { id, userId },
      include: transactionDetailInclude,
    });
    if (!row) throw notFound('Transaction not found');
    return toTransactionDetail(row);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateTransactionInput,
  ): Promise<TransactionUpdateResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.transaction.findFirst({ where: { id, userId } });
      if (!existing) throw notFound('Transaction not found');

      const data: Prisma.TransactionUncheckedUpdateInput = {};

      if (input.categoryId !== undefined) {
        const assignment = await resolveCategoryAssignment(tx, userId, input.categoryId);
        Object.assign(data, assignment, { categoryConfidence: input.categoryId ? 1 : null });
      }
      let merchantId = existing.merchantId;
      if (input.merchantName !== undefined) {
        const merchant = await findOrCreateMerchant(tx, userId, input.merchantName);
        merchantId = merchant.id;
        Object.assign(data, { merchantId: merchant.id, merchantName: merchant.name });
      }
      if (input.notes !== undefined) data.notes = input.notes || null;
      if (input.status !== undefined) data.status = input.status;
      if (input.transactionType !== undefined) {
        data.transactionType = input.transactionType;
        const flow = FLOW_FOR_TYPE[input.transactionType];
        if (flow) data.flow = flow;
      }

      await tx.transaction.update({ where: { id }, data });

      let alsoUpdated = 0;
      if (input.applyToMerchant && input.categoryId !== undefined) {
        if (!merchantId) {
          throw new AppError(
            'VALIDATION_ERROR',
            'This transaction has no merchant to apply the category to',
            {
              fields: { applyToMerchant: 'No merchant' },
            },
          );
        }
        alsoUpdated = await this.applyCategoryToMerchant(
          tx,
          userId,
          merchantId,
          input.categoryId,
          id,
        );
      }

      return { alsoUpdated };
    });
    await this.onChange(userId);
    // Read after the refresh so the recurring flag is current.
    return { transaction: await this.get(userId, id), alsoUpdated: result.alsoUpdated };
  }

  /**
   * A user correction becomes a rule: the merchant remembers the category,
   * a MERCHANT rule is stored for future imports, and the merchant's other
   * transactions are recategorised.
   */
  private async applyCategoryToMerchant(
    tx: Prisma.TransactionClient,
    userId: string,
    merchantId: string,
    categoryId: string | null,
    excludeId: string,
  ): Promise<number> {
    const merchant = await tx.merchant.findFirst({ where: { id: merchantId, userId } });
    if (!merchant) throw notFound('Merchant not found');
    const assignment = await resolveCategoryAssignment(tx, userId, categoryId);

    await tx.merchant.update({ where: { id: merchant.id }, data: { userCategoryId: categoryId } });
    if (categoryId) {
      await tx.userCategoryRule.upsert({
        where: {
          userId_matchField_pattern: {
            userId,
            matchField: 'MERCHANT',
            pattern: merchant.normalizedName,
          },
        },
        update: { categoryId },
        create: { userId, matchField: 'MERCHANT', pattern: merchant.normalizedName, categoryId },
      });
    } else {
      await tx.userCategoryRule.deleteMany({
        where: { userId, matchField: 'MERCHANT', pattern: merchant.normalizedName },
      });
    }

    const result = await tx.transaction.updateMany({
      where: { userId, merchantId: merchant.id, id: { not: excludeId } },
      data: { ...assignment, categoryConfidence: categoryId ? 1 : null },
    });
    return result.count;
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.prisma.transaction.deleteMany({ where: { id, userId } });
    if (result.count === 0) throw notFound('Transaction not found');
    await this.onChange(userId);
  }

  /**
   * Delete every transaction and every import record. Merchants and the
   * user's category rules are kept so a fresh import is categorised the same way.
   */
  async removeAll(userId: string): Promise<{ transactions: number; imports: number }> {
    return this.prisma.$transaction(async (tx) => {
      const transactions = await tx.transaction.deleteMany({ where: { userId } });
      const imports = await tx.import.deleteMany({ where: { userId } });
      await tx.recurringPayment.deleteMany({ where: { userId } });
      await tx.insight.deleteMany({ where: { userId } });
      return { transactions: transactions.count, imports: imports.count };
    });
  }
}
