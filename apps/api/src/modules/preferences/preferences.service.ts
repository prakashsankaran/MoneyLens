import type { PrismaClient, TransactionFlow } from '@prisma/client';
import { addMonths, istDate, monthKeyOf, parseMonthKey } from '@moneylens/shared';
import type { MonthlySummarySent, Preferences, PreferencesUpdateResult } from '@moneylens/types';
import type { UpdatePreferencesInput } from '@moneylens/validation';
import { AnalyticsDataSource } from '../../lib/analytics-data';
import { resolveCategoryAssignment } from '../../lib/categories';
import { AppError, notFound } from '../../lib/errors';
import type { Mailer } from '../../lib/mailer';
import { InsightsService } from '../insights/insights.service';
import { looksLikePerson } from '../imports/pipeline/people';
import { RecurringService } from '../recurring/recurring.service';
import { monthlySummaryEmail } from './monthly-summary';

/** Monthly summaries go out from 9:00 IST on the 1st, for the month just ended. */
const SEND_FROM_HOUR_IST = 9;

/** Types that are never a payment to or from a person. */
const NOT_PEOPLE = ['REFUND', 'CASHBACK', 'SELF_TRANSFER'] as const;

export interface PreferencesOptions {
  /** Sends the monthly summary; without one the feature is unavailable. */
  mailer?: Mailer;
  /** The app's address, for the link in the email. */
  appUrl: string;
  onMailError?: (err: unknown, userId: string) => void;
}

/**
 * Per-account settings that change how MoneyLens works for you: the monthly
 * summary email, and the categories for payments to and from people.
 */
export class PreferencesService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly insights: InsightsService,
    private readonly onChange: (userId: string) => Promise<void> | void,
    private readonly options: PreferencesOptions,
  ) {}

  async get(userId: string): Promise<Preferences> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        monthlySummaryEmail: true,
        monthlySummarySentFor: true,
        peopleOutCategoryId: true,
        peopleInCategoryId: true,
      },
    });
    if (!user) throw notFound('Account not found');
    return {
      monthlySummary: {
        available: !!this.options.mailer,
        enabled: user.monthlySummaryEmail,
        sendTo: user.email,
        lastSentFor: user.monthlySummarySentFor,
      },
      people: { outCategoryId: user.peopleOutCategoryId, inCategoryId: user.peopleInCategoryId },
    };
  }

  async update(userId: string, input: UpdatePreferencesInput): Promise<PreferencesUpdateResult> {
    if (input.monthlySummaryEmail && !this.options.mailer) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Email is not set up on this MoneyLens, so the monthly summary cannot be sent.',
      );
    }
    // Check the categories before saving either of them.
    for (const id of [input.peopleOutCategoryId, input.peopleInCategoryId]) {
      if (id) await resolveCategoryAssignment(this.prisma, userId, id);
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        monthlySummaryEmail: input.monthlySummaryEmail,
        peopleOutCategoryId: input.peopleOutCategoryId,
        peopleInCategoryId: input.peopleInCategoryId,
      },
    });

    let recategorised = 0;
    if (input.peopleOutCategoryId) {
      recategorised += await this.fillPeople(userId, 'OUT', input.peopleOutCategoryId);
    }
    if (input.peopleInCategoryId) {
      recategorised += await this.fillPeople(userId, 'IN', input.peopleInCategoryId);
    }
    if (recategorised > 0) await this.onChange(userId);
    return { preferences: await this.get(userId), recategorised };
  }

  /** Give the new people category to earlier uncategorised payments to (or from) people. */
  private async fillPeople(
    userId: string,
    flow: TransactionFlow,
    categoryId: string,
  ): Promise<number> {
    const candidates = await this.prisma.transaction.findMany({
      where: {
        userId,
        flow,
        categoryId: null,
        status: 'CONFIRMED',
        transactionType: { notIn: [...NOT_PEOPLE] },
      },
      select: { id: true, merchantName: true, upiId: true },
    });
    const ids = candidates
      .filter((t) => t.merchantName && looksLikePerson(t.merchantName, t.upiId))
      .map((t) => t.id);
    if (ids.length === 0) return 0;
    const assignment = await resolveCategoryAssignment(this.prisma, userId, categoryId);
    const result = await this.prisma.transaction.updateMany({
      where: { userId, id: { in: ids }, categoryId: null },
      data: { ...assignment, categoryConfidence: 0.5 },
    });
    return result.count;
  }

  /**
   * Email the summary of the last month that has transactions, now. For
   * trying the email out, or getting it again.
   */
  async sendNow(userId: string, now = new Date()): Promise<MonthlySummarySent> {
    const mailer = this.requireMailer();
    const months = await this.insights.availableMonths(userId);
    const current = monthKeyOf(now);
    const month = [...months].reverse().find((m) => m < current) ?? months.at(-1);
    if (!month) {
      throw new AppError(
        'VALIDATION_ERROR',
        'There are no transactions to summarise yet. Import a statement first.',
      );
    }
    const sentTo = await this.send(mailer, userId, month);
    return { month, sentTo };
  }

  /**
   * Send every summary that is due: for each account with the email switched
   * on and transactions last month, once per month. Run by the server on a
   * timer; a server that was asleep on the 1st catches up when it wakes.
   */
  async sendDue(now = new Date()): Promise<number> {
    const mailer = this.options.mailer;
    if (!mailer) return 0;
    const current = monthKeyOf(now);
    const { year, month } = parseMonthKey(current);
    if (now < istDate(year, month, 1, SEND_FROM_HOUR_IST)) return 0;
    const due = addMonths(current, -1);

    const users = await this.prisma.user.findMany({
      where: {
        monthlySummaryEmail: true,
        OR: [{ monthlySummarySentFor: null }, { monthlySummarySentFor: { lt: due } }],
      },
      select: { id: true },
    });
    let sent = 0;
    for (const { id } of users) {
      try {
        const months = await this.insights.availableMonths(id);
        if (!months.includes(due)) continue;
        await this.send(mailer, id, due);
        sent += 1;
      } catch (err) {
        // One account's failure must not stop the others; it is retried next run.
        this.options.onMailError?.(err, id);
      }
    }
    return sent;
  }

  private async send(mailer: Mailer, userId: string, month: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, monthlySummarySentFor: true },
    });
    if (!user) throw notFound('Account not found');
    const report = await this.insights.report(userId, month);
    await mailer.send(
      monthlySummaryEmail(report, { to: user.email, name: user.name, appUrl: this.options.appUrl }),
    );
    if (!user.monthlySummarySentFor || user.monthlySummarySentFor < month) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { monthlySummarySentFor: month },
      });
    }
    return user.email;
  }

  private requireMailer(): Mailer {
    if (!this.options.mailer) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Email is not set up on this MoneyLens, so the monthly summary cannot be sent.',
      );
    }
    return this.options.mailer;
  }
}

/**
 * The server's monthly summary job, with its own services: it only reads
 * reports and records what it sent.
 */
export function monthlySummaryJob(deps: {
  prisma: PrismaClient;
  mailer: Mailer;
  appUrl: string;
  onMailError: (err: unknown, userId: string) => void;
}): (now?: Date) => Promise<number> {
  const data = new AnalyticsDataSource(deps.prisma);
  const insights = new InsightsService(data, new RecurringService(deps.prisma, data));
  const service = new PreferencesService(deps.prisma, insights, () => undefined, {
    mailer: deps.mailer,
    appUrl: deps.appUrl,
    onMailError: deps.onMailError,
  });
  return (now) => service.sendDue(now);
}
