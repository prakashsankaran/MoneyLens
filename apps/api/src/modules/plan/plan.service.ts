import type { Prisma, PrismaClient } from '@prisma/client';
import {
  baselineMonths,
  budgetStatus,
  buildMoneyPlan,
  observedBaseline,
  simulate,
} from '@moneylens/analytics';
import { monthKeyOf, monthRangeUtc, rupeesToPaise } from '@moneylens/shared';
import type {
  BudgetsResponse,
  FinancialProfileData,
  MoneyPlanResponse,
  ObservedBaseline,
  ScenarioAdjustment,
  SimulationResult,
  UpcomingExpense,
} from '@moneylens/types';
import type { z } from 'zod';
import type { moneyPlanSchema, putBudgetsSchema, simulationSchema } from '@moneylens/validation';
import { type AnalyticsDataSource, budgetMonthDate } from '../../lib/analytics-data';
import { AppError } from '../../lib/errors';
import { decimalToPaise } from '../../lib/money';

type ProfileInput = z.output<typeof moneyPlanSchema>;
type SimulationInput = z.output<typeof simulationSchema>;
type PutBudgetsInput = z.output<typeof putBudgetsSchema>;

const MONEY_FIELDS = [
  ['monthlyIncome', 'monthlyIncomePaise'],
  ['fixedExpenses', 'fixedExpensesPaise'],
  ['emis', 'emisPaise'],
  ['insurance', 'insurancePaise'],
  ['investments', 'investmentsPaise'],
  ['savingsTarget', 'savingsTargetPaise'],
  ['emergencyFundTarget', 'emergencyFundTargetPaise'],
  ['emergencyFundCurrent', 'emergencyFundCurrentPaise'],
] as const;

type ProfileRow = Prisma.FinancialProfileGetPayload<object>;

function toProfileData(row: ProfileRow): FinancialProfileData {
  const money = (v: Prisma.Decimal | null) => (v === null ? null : decimalToPaise(v));
  const upcoming = Array.isArray(row.upcomingExpenses)
    ? (row.upcomingExpenses as { label: string; amount: string; dueMonth: string }[]).map(
        (e): UpcomingExpense => ({
          label: e.label,
          amountPaise: rupeesToPaise(e.amount),
          dueMonth: e.dueMonth,
        }),
      )
    : [];
  const out = { upcomingExpenses: upcoming, updatedAt: row.updatedAt.toISOString() } as Record<
    string,
    unknown
  >;
  for (const [field, key] of MONEY_FIELDS) out[key] = money(row[field]);
  return out as unknown as FinancialProfileData;
}

/**
 * The money plan (the user's own figures plus their transaction averages),
 * monthly budgets and the what-if simulator. All arithmetic happens in
 * @moneylens/analytics; this service loads and stores data.
 */
export class PlanService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly data: AnalyticsDataSource,
  ) {}

  /** Monthly averages over the latest complete months with data. */
  async baseline(userId: string, now = new Date()): Promise<ObservedBaseline> {
    const [available, categories] = await Promise.all([
      this.data.monthsWithData(userId),
      this.data.categories(userId),
    ]);
    const months = baselineMonths(available, monthKeyOf(now));
    if (months.length === 0) return observedBaseline([], categories, []);
    const txs = await this.data.transactionsBetween(
      userId,
      monthRangeUtc(months[0] as string).start,
      monthRangeUtc(months.at(-1) as string).end,
    );
    return observedBaseline(txs, categories, months);
  }

  async get(userId: string, now = new Date()): Promise<MoneyPlanResponse> {
    const [row, baseline, saved] = await Promise.all([
      this.prisma.financialProfile.findUnique({ where: { userId } }),
      this.baseline(userId, now),
      this.prisma.moneyPlan.findFirst({
        where: { userId, isActive: true },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ]);
    const profile = row ? toProfileData(row) : null;
    return {
      profile,
      plan: buildMoneyPlan({ profile, baseline, currentMonth: monthKeyOf(now) }),
      savedAt: saved?.updatedAt.toISOString() ?? null,
    };
  }

  /**
   * Save the profile. With `replace`, fields left out are cleared (POST);
   * otherwise only the fields sent change (PATCH). The computed plan is kept
   * as a snapshot of what the user saw when they saved.
   */
  async save(
    userId: string,
    input: ProfileInput,
    { replace }: { replace: boolean },
    now = new Date(),
  ): Promise<MoneyPlanResponse> {
    const data: Prisma.FinancialProfileUncheckedUpdateInput = {};
    for (const [field] of MONEY_FIELDS) {
      const value = input[field];
      if (value !== undefined) data[field] = value;
      else if (replace) data[field] = null;
    }
    if (input.upcomingExpenses !== undefined) data.upcomingExpenses = input.upcomingExpenses;
    else if (replace) data.upcomingExpenses = [];

    const row = await this.prisma.financialProfile.upsert({
      where: { userId },
      create: { ...(data as Prisma.FinancialProfileUncheckedCreateInput), userId },
      update: data,
    });
    const profile = toProfileData(row);
    const baseline = await this.baseline(userId, now);
    const plan = buildMoneyPlan({ profile, baseline, currentMonth: monthKeyOf(now) });

    const snapshot = await this.prisma.$transaction(async (tx) => {
      await tx.moneyPlan.deleteMany({ where: { userId } });
      return tx.moneyPlan.create({
        data: {
          userId,
          name: 'My money plan',
          inputs: profile as unknown as Prisma.InputJsonValue,
          allocation: plan as unknown as Prisma.InputJsonValue,
        },
        select: { updatedAt: true },
      });
    });
    return { profile, plan, savedAt: snapshot.updatedAt.toISOString() };
  }

  async simulate(
    userId: string,
    input: SimulationInput,
    now = new Date(),
  ): Promise<SimulationResult> {
    const [baseline, categories] = await Promise.all([
      this.baseline(userId, now),
      this.data.categories(userId),
    ]);
    const known = new Set(categories.map((c) => c.id));
    const adjustments = input.adjustments.map((a): ScenarioAdjustment => {
      if (
        (a.type === 'category-percent' || a.type === 'category-amount') &&
        !known.has(a.categoryId)
      ) {
        throw new AppError('VALIDATION_ERROR', 'Some fields are invalid', {
          fields: { categoryId: 'Unknown category' },
        });
      }
      switch (a.type) {
        case 'category-percent':
          return a;
        case 'category-amount':
          return { type: a.type, categoryId: a.categoryId, amountPaise: rupeesToPaise(a.amount) };
        case 'save-more':
          return { type: a.type, amountPaise: rupeesToPaise(a.amount) };
        case 'income-change': {
          const negative = a.amount.startsWith('-');
          const paise = rupeesToPaise(negative ? a.amount.slice(1) : a.amount);
          return { type: a.type, amountPaise: negative ? -paise : paise };
        }
      }
    });
    return simulate({ baseline, categories, adjustments, annualReturnPct: input.annualReturnPct });
  }

  async budgets(userId: string, requested?: string, now = new Date()): Promise<BudgetsResponse> {
    const current = monthKeyOf(now);
    const month = requested ?? current;
    const { start, end } = monthRangeUtc(month);
    const [budgets, txs, categories, withData, budgetMonths] = await Promise.all([
      this.data.budgets(userId, month),
      this.data.transactionsBetween(userId, start, end),
      this.data.categories(userId),
      this.data.monthsWithData(userId),
      this.prisma.budget.findMany({
        where: { userId },
        distinct: ['month'],
        select: { month: true },
      }),
    ]);
    const availableMonths = [
      ...new Set([
        ...withData,
        ...budgetMonths.map((b) => b.month.toISOString().slice(0, 7)),
        current,
        month,
      ]),
    ].sort();
    return { month, availableMonths, ...budgetStatus(budgets, txs, categories, month, now) };
  }

  /** Set, change or (with a null amount) remove budgets for one month. */
  async putBudgets(
    userId: string,
    month: string,
    input: PutBudgetsInput,
    now = new Date(),
  ): Promise<BudgetsResponse> {
    const ids = [...new Set(input.items.map((i) => i.categoryId))];
    const visible = await this.prisma.category.count({
      where: { id: { in: ids }, OR: [{ userId: null }, { userId }] },
    });
    if (visible !== ids.length) {
      throw new AppError('VALIDATION_ERROR', 'Some fields are invalid', {
        fields: { categoryId: 'Unknown category' },
      });
    }
    const date = budgetMonthDate(month);
    await this.prisma.$transaction(async (tx) => {
      for (const item of input.items) {
        const where = {
          userId_categoryId_month: { userId, categoryId: item.categoryId, month: date },
        };
        if (item.amount === null) {
          await tx.budget.deleteMany({
            where: { userId, categoryId: item.categoryId, month: date },
          });
        } else {
          await tx.budget.upsert({
            where,
            create: { userId, categoryId: item.categoryId, month: date, amount: item.amount },
            update: { amount: item.amount },
          });
        }
      }
    });
    return this.budgets(userId, month, now);
  }
}
