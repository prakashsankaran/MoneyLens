import {
  categoriesAboveAverage,
  comparePeriods,
  categoryBreakdown,
  groupByMonth,
  monthlyTrend,
  smallTransactionAccumulation,
  summarizePeriod,
  topMerchants,
} from '@moneylens/analytics';
import { monthKeyOf, monthRangeUtc, monthsEnding } from '@moneylens/shared';
import type { DashboardData } from '@moneylens/types';
import type { AnalyticsDataSource } from '../../lib/analytics-data';
import type { InsightsService } from '../insights/insights.service';

/** Number of months shown in the spending trend. */
export const TREND_MONTHS = 6;
/** Months of history used for "above your average" comparisons. */
export const AVERAGE_MONTHS = 3;

export class DashboardService {
  constructor(
    private readonly data: AnalyticsDataSource,
    private readonly insights: InsightsService,
  ) {}

  /**
   * Assemble the dashboard for one month. All figures are computed by the
   * deterministic analytics engine; nothing here is AI-generated.
   */
  async getDashboard(userId: string, requestedMonth?: string): Promise<DashboardData> {
    const availableMonths = await this.data.monthsWithData(userId);
    const month = requestedMonth ?? availableMonths.at(-1) ?? monthKeyOf(new Date());

    const months = monthsEnding(month, TREND_MONTHS);
    const start = monthRangeUtc(months[0] as string).start;
    const end = monthRangeUtc(month).end;

    const [txs, categories, { health, savingOpportunities }] = await Promise.all([
      this.data.transactionsBetween(userId, start, end),
      this.data.categories(userId),
      this.insights.summary(userId, month),
    ]);

    const byMonth = groupByMonth(txs);
    const current = byMonth.get(month) ?? [];
    const history = months.slice(-1 - AVERAGE_MONTHS, -1).map((m) => byMonth.get(m) ?? []);
    const trend = monthlyTrend(txs, months);
    const [previousPoint, currentPoint] = trend.slice(-2);
    const hasPrevious = (byMonth.get(previousPoint?.month ?? '') ?? []).length > 0;

    return {
      month,
      availableMonths,
      historyMonths: availableMonths.filter((m) => m < month).length,
      totals: summarizePeriod(current),
      comparison:
        hasPrevious && previousPoint && currentPoint
          ? comparePeriods(currentPoint, previousPoint)
          : null,
      categories: categoryBreakdown(current, categories),
      trend,
      topMerchants: topMerchants(current, 5),
      observations: [
        ...categoriesAboveAverage(current, history, categories),
        ...smallTransactionAccumulation(current),
      ],
      savingOpportunities,
      health,
    };
  }
}
