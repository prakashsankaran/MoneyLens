import type {
  BudgetsResponse,
  MoneyPlanResponse,
  ObservedBaseline,
  SimulationResult,
} from '@moneylens/types';

const DISCLAIMER =
  'Educational planning suggestion based on the figures you entered and your transactions. It is not professional financial advice.';

export const baselineFixture: ObservedBaseline = {
  months: ['2026-06', '2026-07', '2026-08'],
  incomePaise: 14_500_000,
  commitmentsPaise: 3_445_000,
  investingPaise: 1_000_000,
  essentialPaise: 2_100_000,
  lifestylePaise: 1_800_000,
  otherPaise: 260_600,
  spendingPaise: 7_605_600,
  categories: [
    {
      categoryId: 'food-delivery',
      name: 'Food Delivery',
      slug: 'food-delivery',
      kind: 'lifestyle',
      averagePaise: 600_000,
    },
  ],
};

export const emptyPlanFixture: MoneyPlanResponse = {
  profile: null,
  savedAt: null,
  plan: {
    ready: false,
    missing: ['monthly income'],
    baseline: baselineFixture,
    breakdown: [],
    surplusPaise: 0,
    goals: [],
    afterGoalsPaise: 0,
    status: 'incomplete',
    suggestions: [],
    suggestedBudgets: [],
    disclaimer: DISCLAIMER,
  },
};

export const planFixture: MoneyPlanResponse = {
  savedAt: '2026-10-05T06:30:00.000Z',
  profile: {
    monthlyIncomePaise: 14_500_000,
    fixedExpensesPaise: 3_200_000,
    emisPaise: null,
    insurancePaise: 245_000,
    investmentsPaise: 1_000_000,
    savingsTargetPaise: 2_500_000,
    emergencyFundTargetPaise: null,
    emergencyFundCurrentPaise: null,
    upcomingExpenses: [],
    updatedAt: '2026-10-05T06:30:00.000Z',
  },
  plan: {
    ready: true,
    missing: [],
    baseline: baselineFixture,
    breakdown: [
      {
        key: 'income',
        label: 'Monthly income',
        amountPaise: 14_500_000,
        source: 'ENTERED',
        note: null,
      },
      {
        key: 'commitments',
        label: 'Fixed commitments',
        amountPaise: 3_445_000,
        source: 'ENTERED',
        note: null,
      },
      {
        key: 'essential',
        label: 'Essential expenses',
        amountPaise: 2_100_000,
        source: 'OBSERVED',
        note: 'Average of June–August 2026',
      },
      {
        key: 'lifestyle',
        label: 'Lifestyle expenses',
        amountPaise: 1_800_000,
        source: 'OBSERVED',
        note: null,
      },
      {
        key: 'other',
        label: 'Other spending',
        amountPaise: 260_600,
        source: 'OBSERVED',
        note: null,
      },
      {
        key: 'investments',
        label: 'Investments',
        amountPaise: 1_000_000,
        source: 'ENTERED',
        note: null,
      },
      {
        key: 'surplus',
        label: 'Available surplus',
        amountPaise: 3_689_400,
        source: 'CALCULATED',
        note: null,
      },
    ],
    surplusPaise: 3_689_400,
    goals: [
      {
        key: 'savings',
        label: 'Savings target',
        amountPaise: 2_500_000,
        source: 'ENTERED',
        note: null,
      },
    ],
    afterGoalsPaise: 1_189_400,
    status: 'on-track',
    suggestions: [
      { kind: 'RECOMMENDATION', text: 'Your goals fit with about ₹11,894 a month to spare.' },
    ],
    suggestedBudgets: [
      {
        categoryId: 'food-delivery',
        name: 'Food Delivery',
        kind: 'lifestyle',
        averagePaise: 600_000,
        suggestedPaise: 600_000,
        reason: 'Your average',
      },
    ],
    disclaimer: DISCLAIMER,
  },
};

export const budgetsFixture: BudgetsResponse = {
  month: '2026-10',
  availableMonths: ['2026-09', '2026-10'],
  items: [
    {
      id: 'b1',
      categoryId: 'food-delivery',
      name: 'Food Delivery',
      slug: 'food-delivery',
      parentId: 'food',
      amountPaise: 500_000,
      spentPaise: 450_000,
      remainingPaise: 50_000,
      usedPct: 90,
      status: 'near',
      projectedPaise: 2_790_000,
    },
  ],
  totalBudgetPaise: 500_000,
  totalSpentPaise: 450_000,
  unbudgetedSpendingPaise: 120_000,
  daysElapsed: 5,
  daysInMonth: 31,
};

export const simulationFixture: SimulationResult = {
  baseline: {
    months: ['2026-06', '2026-07', '2026-08'],
    incomePaise: 14_500_000,
    spendingPaise: 7_605_600,
    savedPaise: 6_894_400,
  },
  adjustments: [
    {
      description: 'Reduce Food by 20%',
      monthlyImpactPaise: 180_000,
      note: '20% of your 3-month average of ₹9,000.',
    },
  ],
  monthlyImpactPaise: 180_000,
  annualImpactPaise: 2_160_000,
  newMonthlySavedPaise: 7_074_400,
  annualReturnPct: 6,
  projections: [
    { years: 1, contributedPaise: 2_160_000, withReturnPaise: 2_220_000 },
    { years: 5, contributedPaise: 10_800_000, withReturnPaise: 12_560_000 },
  ],
  assumptions: ['Returns are an assumption, not a guarantee.'],
};
