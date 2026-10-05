import type { PrismaClient } from '@prisma/client';
import { detectRecurring } from '@moneylens/analytics';
import { addMonths, monthKeyOf, monthRangeUtc, paiseToRupeeString } from '@moneylens/shared';
import type {
  AnalyticsTransaction,
  CategoryRef,
  RecurringSeries,
  RecurringSummary,
} from '@moneylens/types';
import type { AnalyticsDataSource } from '../../lib/analytics-data';
import { notFound } from '../../lib/errors';

/** Months of history scanned: enough to see a yearly payment twice. */
export const RECURRING_WINDOW_MONTHS = 15;

/** First instant of the detection window that ends with `month`. */
export function recurringWindowStart(month: string): Date {
  return monthRangeUtc(addMonths(month, -(RECURRING_WINDOW_MONTHS - 1))).start;
}

/**
 * Recurring payment detection and its stored state. Detection itself is the
 * pure `detectRecurring`; this service keeps one row per detected series so
 * that a user's "not recurring" dismissal survives re-detection, and marks
 * the series' transactions so they can be filtered.
 */
export class RecurringService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly data: AnalyticsDataSource,
  ) {}

  /**
   * Series in the window ending with `month`, judged as of `asOf`.
   * `txs` may cover a longer period; only the window is used.
   */
  detectIn(
    txs: readonly AnalyticsTransaction[],
    categories: readonly CategoryRef[],
    month: string,
    asOf: Date,
  ): RecurringSeries[] {
    const start = recurringWindowStart(month);
    const end = monthRangeUtc(month).end;
    const inWindow = txs.filter((t) => t.date >= start && t.date < end);
    return detectRecurring(inWindow, { asOf, categories });
  }

  /** Detect series as of now over the latest window. */
  private async detectNow(userId: string, now: Date) {
    const month = monthKeyOf(now);
    const [txs, categories] = await Promise.all([
      this.data.transactionsBetween(userId, recurringWindowStart(month), monthRangeUtc(month).end),
      this.data.categories(userId),
    ]);
    return this.detectIn(txs, categories, month, now);
  }

  /**
   * Re-detect and store the user's series. Called after anything that changes
   * transactions. Series no longer found are forgotten unless dismissed, so a
   * dismissal still applies if the series comes back.
   */
  async refresh(userId: string, now = new Date()): Promise<void> {
    const series = await this.detectNow(userId, now);
    await this.prisma.$transaction(
      async (tx) => {
        await tx.recurringPayment.deleteMany({
          where: { userId, key: { notIn: series.map((s) => s.key) }, dismissedAt: null },
        });
        await tx.transaction.updateMany({
          where: { userId, OR: [{ isRecurring: true }, { recurringGroupId: { not: null } }] },
          data: { isRecurring: false, recurringGroupId: null },
        });
        for (const s of series) {
          const data = {
            flow: s.flow,
            merchantId: s.merchantId,
            label: s.label,
            frequency: s.frequency,
            typicalAmount: paiseToRupeeString(s.typicalAmountPaise),
            lastChargedAt: new Date(`${s.lastDate}T00:00:00+05:30`),
            nextExpectedAt: new Date(`${s.nextExpectedDate}T00:00:00+05:30`),
            occurrenceCount: s.occurrences,
            confidence: s.confidence,
            isSubscription: s.subscriptionLike,
            isActive: s.active,
          };
          const row = await tx.recurringPayment.upsert({
            where: { userId_key: { userId, key: s.key } },
            create: { userId, key: s.key, ...data },
            update: data,
            select: { id: true, dismissedAt: true },
          });
          if (row.dismissedAt) continue;
          await tx.transaction.updateMany({
            where: { userId, id: { in: s.transactionIds } },
            data: { isRecurring: true, recurringGroupId: row.id },
          });
        }
      },
      { timeout: 20_000 },
    );
  }

  /** Keys of series the user said are not recurring. */
  async dismissedKeys(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.recurringPayment.findMany({
      where: { userId, dismissedAt: { not: null } },
      select: { key: true },
    });
    return new Set(rows.map((r) => r.key));
  }

  /** Current series with their stored ids and dismissal state. */
  async list(userId: string, now = new Date()): Promise<RecurringSummary> {
    const series = await this.detectNow(userId, now);
    const read = () =>
      this.prisma.recurringPayment.findMany({
        where: { userId },
        select: { id: true, key: true, dismissedAt: true },
      });
    let rows = await read();
    // Data imported before detection was stored, or a race with a refresh.
    if (series.some((s) => !rows.some((r) => r.key === s.key))) {
      await this.refresh(userId, now);
      rows = await read();
    }
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const items = series.flatMap((s) => {
      const row = byKey.get(s.key);
      return row ? [{ ...s, id: row.id, dismissed: row.dismissedAt !== null }] : [];
    });
    const monthly = items
      .filter((i) => i.flow === 'OUT' && i.active && !i.dismissed)
      .reduce((a, i) => a + i.monthlyEquivalentPaise, 0);
    return { items, monthlyOutgoingPaise: monthly, annualOutgoingPaise: monthly * 12 };
  }

  /** Dismiss a series ("not recurring") or bring it back. */
  async setDismissed(userId: string, id: string, dismissed: boolean): Promise<RecurringSummary> {
    const result = await this.prisma.recurringPayment.updateMany({
      where: { id, userId },
      data: { dismissedAt: dismissed ? new Date() : null },
    });
    if (result.count === 0) throw notFound('Recurring payment not found');
    await this.refresh(userId);
    return this.list(userId);
  }
}
