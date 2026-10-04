import {
  categoryBreakdown,
  comparePeriods,
  monthlyTrend,
  summarizePeriod,
  topLevelCategory,
  topMerchants,
} from '@moneylens/analytics';
import { addMonths, monthKeyOf, monthRangeUtc, monthsEnding } from '@moneylens/shared';
import type {
  CategoryAnalytics,
  MerchantAnalytics,
  MonthlyAnalytics,
  TrendAnalytics,
} from '@moneylens/types';
import type { AnalyticsDataSource } from '../../lib/analytics-data';
import { notFound } from '../../lib/errors';

/**
 * Read-only analytics over confirmed transactions. Every figure comes from the
 * deterministic engine in @moneylens/analytics.
 */
export class AnalyticsService {
  constructor(private readonly data: AnalyticsDataSource) {}

  /** The requested month, else the latest month with data, else this month. */
  private async resolveMonth(userId: string, month?: string) {
    const availableMonths = await this.data.monthsWithData(userId);
    return { month: month ?? availableMonths.at(-1) ?? monthKeyOf(new Date()), availableMonths };
  }

  private async monthTransactions(userId: string, month: string) {
    const { start, end } = monthRangeUtc(month);
    return this.data.transactionsBetween(userId, start, end);
  }

  async monthly(userId: string, requested?: string): Promise<MonthlyAnalytics> {
    const { month, availableMonths } = await this.resolveMonth(userId, requested);
    const previous = addMonths(month, -1);
    const { start } = monthRangeUtc(previous);
    const { end } = monthRangeUtc(month);
    const txs = await this.data.transactionsBetween(userId, start, end);
    const [prevPoint, currentPoint] = monthlyTrend(txs, [previous, month]);
    const current = txs.filter((t) => monthKeyOf(t.date) === month);
    const hasPrevious = txs.some((t) => monthKeyOf(t.date) === previous);
    return {
      month,
      availableMonths,
      totals: summarizePeriod(current),
      comparison:
        hasPrevious && prevPoint && currentPoint ? comparePeriods(currentPoint, prevPoint) : null,
    };
  }

  async categories(
    userId: string,
    q: { month?: string; level: 'top' | 'leaf'; parentId?: string },
  ): Promise<CategoryAnalytics> {
    const { month } = await this.resolveMonth(userId, q.month);
    const [txs, categories] = await Promise.all([
      this.monthTransactions(userId, month),
      this.data.categories(userId),
    ]);

    if (!q.parentId) {
      return { month, parent: null, items: categoryBreakdown(txs, categories, q.level) };
    }

    const parent = categories.find((c) => c.id === q.parentId && c.parentId === null);
    if (!parent) throw notFound('Category not found');
    const byId = new Map(categories.map((c) => [c.id, c]));
    const inParent = txs.filter((t) => topLevelCategory(t.categoryId, byId)?.id === parent.id);
    return {
      month,
      parent: { id: parent.id, name: parent.name, slug: parent.slug },
      items: categoryBreakdown(inParent, categories, 'leaf'),
    };
  }

  async merchants(
    userId: string,
    q: { month?: string; limit: number },
  ): Promise<MerchantAnalytics> {
    const { month } = await this.resolveMonth(userId, q.month);
    const txs = await this.monthTransactions(userId, month);
    return { month, items: topMerchants(txs, q.limit) };
  }

  async trends(userId: string, q: { end?: string; months: number }): Promise<TrendAnalytics> {
    const { month: end } = await this.resolveMonth(userId, q.end);
    const months = monthsEnding(end, q.months);
    const start = monthRangeUtc(months[0] as string).start;
    const txs = await this.data.transactionsBetween(userId, start, monthRangeUtc(end).end);
    return { points: monthlyTrend(txs, months) };
  }
}
