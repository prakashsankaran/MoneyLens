import type { PrismaClient } from '@prisma/client';
import type { BudgetInput } from '@moneylens/analytics';
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

  /** Budgets set for an IST month ("YYYY-MM"). */
  async budgets(userId: string, month: string): Promise<BudgetInput[]> {
    const rows = await this.prisma.budget.findMany({
      where: { userId, month: budgetMonthDate(month) },
      select: { id: true, categoryId: true, amount: true },
    });
    return rows.map((r) => ({
      id: r.id,
      categoryId: r.categoryId,
      amountPaise: decimalToPaise(r.amount),
    }));
  }
}

/** `Budget.month` is a DATE holding the first day of the month. */
export function budgetMonthDate(month: string): Date {
  return new Date(`${month}-01T00:00:00Z`);
}
