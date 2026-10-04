import type { PrismaClient } from '@prisma/client';
import type { AnalyticsTransaction, CategoryRef } from '@moneylens/types';
import { decimalToPaise } from './money';

/**
 * Data access for the analytics engine. Every query is scoped to `userId`;
 * this is the authorisation boundary for financial data.
 */
export class AnalyticsDataSource {
  constructor(private readonly prisma: PrismaClient) {}

  /** Confirmed transactions in [start, end), mapped to the engine's shape. */
  async transactionsBetween(
    userId: string,
    start: Date,
    end: Date,
  ): Promise<AnalyticsTransaction[]> {
    const rows = await this.prisma.transaction.findMany({
      where: { userId, status: 'CONFIRMED', transactionDate: { gte: start, lt: end } },
      select: {
        id: true,
        transactionDate: true,
        amount: true,
        transactionType: true,
        flow: true,
        merchantId: true,
        merchantName: true,
        categoryId: true,
        subcategoryId: true,
      },
      orderBy: { transactionDate: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      date: r.transactionDate,
      amountPaise: decimalToPaise(r.amount),
      type: r.transactionType,
      flow: r.flow,
      merchantId: r.merchantId,
      merchantName: r.merchantName,
      // The engine rolls subcategories up to their parent, so prefer the most
      // specific assignment available.
      categoryId: r.subcategoryId ?? r.categoryId,
    }));
  }

  /** System categories plus the user's own custom categories. */
  async categories(userId: string): Promise<CategoryRef[]> {
    return this.prisma.category.findMany({
      where: { OR: [{ userId: null }, { userId }] },
      select: { id: true, name: true, slug: true, parentId: true, color: true, icon: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /** IST calendar months ("YYYY-MM") in which the user has confirmed transactions. */
  async monthsWithData(userId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ month: string }[]>`
      SELECT DISTINCT to_char("transactionDate" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS month
      FROM "Transaction"
      WHERE "userId" = ${userId} AND "status" = 'CONFIRMED'
      ORDER BY month ASC
    `;
    return rows.map((r) => r.month);
  }
}
