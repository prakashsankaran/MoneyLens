import {
  categoryComparisons,
  findSavingOpportunities,
  generateInsights,
  healthScore,
  monthlyReport,
  periodComparisons,
  spendingPatterns,
} from '@moneylens/analytics';
import { addMonths, monthKeyOf, monthRangeUtc, parseMonthKey } from '@moneylens/shared';
import type {
  ComparisonsResponse,
  HealthScore,
  Insight,
  InsightsResponse,
  MonthlyReport,
} from '@moneylens/types';
import type { AnalyticsDataSource } from '../../lib/analytics-data';
import { type RecurringService, recurringWindowStart } from '../recurring/recurring.service';

/**
 * Insights, saving opportunities, the health score, period comparisons and
 * the monthly report. All of it is computed by @moneylens/analytics from the
 * user's confirmed transactions; nothing here is AI-generated.
 */
export class InsightsService {
  constructor(
    private readonly data: AnalyticsDataSource,
    private readonly recurring: RecurringService,
  ) {}

  /** Months with at least one confirmed transaction, oldest first. */
  availableMonths(userId: string): Promise<string[]> {
    return this.data.monthsWithData(userId);
  }

  /**
   * What the engine needs to explain `month`: transactions from the start of
   * the recurring window (or January of last year, for year-to-date, or an
   * older comparison month), categories, and the recurring series as they
   * looked at the end of the month, minus the ones the user dismissed.
   */
  async context(userId: string, requested?: string, compareMonth?: string) {
    const availableMonths = await this.data.monthsWithData(userId);
    const month = requested ?? availableMonths.at(-1) ?? monthKeyOf(new Date());
    const { year } = parseMonthKey(month);
    const starts = [recurringWindowStart(month), monthRangeUtc(`${year - 1}-01`).start];
    if (compareMonth) starts.push(monthRangeUtc(compareMonth).start);
    const start = new Date(Math.min(...starts.map((d) => d.getTime())));
    const end = monthRangeUtc(month).end;
    const now = new Date();
    const asOf = end < now ? new Date(end.getTime() - 1) : now;

    const [txs, categories, dismissed, budgets] = await Promise.all([
      this.data.transactionsBetween(userId, start, end),
      this.data.categories(userId),
      this.recurring.dismissedKeys(userId),
      this.data.budgets(userId, month),
    ]);
    const recurring = this.recurring
      .detectIn(txs, categories, month, asOf)
      .filter((s) => !dismissed.has(s.key));
    return { month, availableMonths, txs, categories, recurring, budgets, now };
  }

  async insights(userId: string, month?: string): Promise<InsightsResponse> {
    const ctx = await this.context(userId, month);
    const { insights, skipped } = generateInsights(ctx);
    return {
      month: ctx.month,
      availableMonths: ctx.availableMonths,
      historyMonths: ctx.availableMonths.filter((m) => m < ctx.month).length,
      insights: [...findSavingOpportunities(ctx), ...insights],
      skipped,
    };
  }

  /** The health score and the saving opportunities, for the dashboard. */
  async summary(
    userId: string,
    month?: string,
  ): Promise<{ health: HealthScore; savingOpportunities: Insight[] }> {
    const ctx = await this.context(userId, month);
    return { health: healthScore(ctx), savingOpportunities: findSavingOpportunities(ctx) };
  }

  async health(userId: string, month?: string): Promise<HealthScore> {
    return healthScore(await this.context(userId, month));
  }

  async comparisons(userId: string, month?: string): Promise<ComparisonsResponse> {
    const ctx = await this.context(userId, month);
    return {
      month: ctx.month,
      availableMonths: ctx.availableMonths,
      totals: periodComparisons(ctx.txs, ctx.month),
      categories: categoryComparisons(ctx.txs, ctx.month, ctx.categories),
      patterns: spendingPatterns(ctx.txs, ctx.month),
    };
  }

  async report(userId: string, month?: string, compare?: string): Promise<MonthlyReport> {
    const ctx = await this.context(userId, month, compare);
    return monthlyReport({
      ...ctx,
      compareMonth: compare ?? addMonths(ctx.month, -1),
    });
  }
}
