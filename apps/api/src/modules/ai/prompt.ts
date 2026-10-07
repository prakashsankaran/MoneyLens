import { formatINR, formatMonthKey } from '@moneylens/shared';
import type { AssistantContext, AssistantTopic, ReportStatement } from '@moneylens/types';

export const SYSTEM_PROMPT = `You are MoneyLens AI, the assistant inside MoneyLens, a personal finance app for people in India.
You explain the user's own money using ONLY the calculated figures in the <context> block and the "Key figures" list.

Rules you must always follow:
1. Never invent transactions, merchants, categories, amounts, percentages or dates. Use only what is in the context.
2. Never do arithmetic. Do not add, subtract, multiply, divide, average, round differently or convert any figure. If a figure you would need is not given, say it is not available.
3. Copy amounts exactly as written in the context (for example "₹10,381") and percentages as given.
4. If the data cannot answer the question, say so plainly and mention the relevant data limitation (for example "I only have transaction data for September 2026, so I cannot judge a long-term trend").
5. Separate what the figures show from your interpretation. Phrase interpretations as possibilities ("this may be because…"), never as confirmed facts.
6. Use the phrase "potential saving opportunity". Never call spending "waste".
7. This is educational information, not professional financial advice. Do not recommend specific stocks, funds, insurance policies or other products. Never promise or imply guaranteed returns.
8. Never ask for or accept a UPI PIN, password, OTP, CVV, card number or bank login. Never suggest anything illegal, such as hiding income from tax.
9. Answer in plain, friendly English in at most 150 words. Lead with the direct answer. Use short paragraphs or a short list. No headings, no tables.`;

/** Paise fields become formatted rupees and Pct fields get a % sign, recursively. */
function present(value: unknown, key = ''): unknown {
  if (typeof value === 'number') {
    if (/Paise$/.test(key)) return formatINR(value);
    if (/Pct$/.test(key)) return `${value}%`;
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => present(v, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k.replace(/Paise$/, ''), present(v, k)]),
    );
  }
  return value;
}

/** Only the parts of the context a question needs, ready for the model. */
export function contextFor(ctx: AssistantContext, topics: AssistantTopic[]): unknown {
  const has = (...t: AssistantTopic[]) => t.some((x) => topics.includes(x));
  const slice: Record<string, unknown> = {
    month: formatMonthKey(ctx.month),
    monthsAvailable: ctx.monthsAvailable.map((m) => formatMonthKey(m)),
    monthInProgress: ctx.monthInProgress,
    totals: {
      incomePaise: ctx.totals.incomePaise,
      spendingPaise: ctx.totals.spendingPaise,
      savedPaise: ctx.totals.savedPaise,
      savingsRatePct: ctx.totals.savingsRatePct,
      refundsPaise: ctx.totals.refundsPaise,
      cashbackPaise: ctx.totals.cashbackPaise,
      paymentCount: ctx.totals.spendTransactionCount,
    },
    dataLimitations: ctx.dataLimitations,
  };
  if (ctx.previousTotals) {
    slice.previousMonth = {
      month: formatMonthKey(ctx.previousMonth),
      spendingPaise: ctx.previousTotals.spendingPaise,
      incomePaise: ctx.previousTotals.incomePaise,
      spendingChangePaise: ctx.spendingChangePaise,
      spendingChangePct: ctx.spendingChangePct,
      incomeChangePct: ctx.incomeChangePct,
    };
  }
  if (has('overview', 'categories')) slice.categories = ctx.categories.slice(0, 8);
  if (has('change', 'increasing', 'compare', 'driver')) {
    slice.categoryChanges = ctx.categoryChanges
      .filter((c) => c.categoryId !== null)
      .sort((a, b) => Math.abs(b.changePaise) - Math.abs(a.changePaise))
      .slice(0, 12)
      .map(({ categoryId: _id, slug: _slug, ...rest }) => rest);
  }
  if (has('compare', 'change')) {
    slice.comparisons = ctx.comparisons;
    slice.trend = ctx.trend.map((t) => ({ ...t, month: formatMonthKey(t.month) }));
  }
  if (has('merchants')) slice.topMerchants = ctx.topMerchants.map(({ merchantId: _m, ...r }) => r);
  if (has('savings')) {
    slice.savingOpportunities = ctx.savingOpportunities;
    slice.savingOpportunitiesTotalPaise = ctx.savingOpportunitiesTotalPaise;
  }
  if (has('recurring')) {
    slice.recurring = ctx.recurring;
    slice.recurringMonthlyPaise = ctx.recurringMonthlyPaise;
    slice.recurringAnnualPaise = ctx.recurringAnnualPaise;
  }
  if (has('health')) slice.health = ctx.health;
  if (has('plan')) slice.plan = ctx.plan;
  if (has('change', 'increasing', 'savings', 'overview')) {
    slice.observations = ctx.insights.slice(0, 8);
    slice.weekendVsWeekday = {
      weekdayDailyAveragePaise: ctx.patterns.weekdayDailyAveragePaise,
      weekendDailyAveragePaise: ctx.patterns.weekendDailyAveragePaise,
      weekendRatio: ctx.patterns.weekendRatio,
    };
  }
  return present(slice);
}

/** The user turn: context, key figures, then the question. */
export function questionTurn(question: string, context: unknown, facts: ReportStatement[]): string {
  return [
    '<context>',
    JSON.stringify(context, null, 1),
    '</context>',
    '',
    'Key figures (already calculated; use these wording and values):',
    ...facts.map((f) => `- [${f.kind}] ${f.text}`),
    '',
    `Question: ${question}`,
  ].join('\n');
}

/** Sent once when the first answer used figures that are not in the context. */
export function correctionTurn(unsupported: string[], violations: string[]): string {
  const problems = [
    ...(unsupported.length
      ? [
          `These figures are not in the context: ${unsupported.join(', ')}. Remove them or replace them with figures that are.`,
        ]
      : []),
    ...violations.map((v) => `The answer ${v}; rewrite it without that.`),
  ];
  return `Your answer broke the rules. ${problems.join(' ')} Do not calculate anything. Answer the same question again.`;
}

export const BRIEF_INSTRUCTION =
  'Write the AI Money Brief: 3 or 4 sentences summarising this month for the user, in the second person. Say where most money went, what changed, and one potential saving opportunity if there is one. Use only the key figures.';
