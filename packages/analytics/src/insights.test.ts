import { describe, expect, it } from 'vitest';
import { istDate } from '@moneylens/shared';
import {
  INSIGHT_GROUPS,
  type AnalyticsTransaction,
  type Insight,
  type RecurringSeries,
} from '@moneylens/types';
import { generateInsights, INSIGHT_RULES } from './insights';
import { categories, series, tx } from './test-helpers';

/** A debit on `day` of `month` (2026; September by default). */
const on = (
  day: number,
  amountPaise: number,
  extra: Partial<AnalyticsTransaction> = {},
  month = 9,
) => tx({ amountPaise, date: istDate(2026, month, day, 12), ...extra });

const run = (txs: AnalyticsTransaction[], recurring: RecurringSeries[] = []) =>
  generateInsights({ month: '2026-09', txs, categories, recurring });

const byRule = (insights: Insight[], rule: string) => insights.filter((i) => i.rule === rule);

describe('generateInsights', () => {
  it('says there is nothing to explain for an empty month', () => {
    expect(run([on(1, 10_000, {}, 8)])).toEqual({
      insights: [],
      skipped: [{ rule: 'all', reason: 'No transactions in this month.' }],
    });
  });

  it('skips history-based rules, saying why, when there is no history', () => {
    const { skipped } = run([on(3, 50_000)]);
    const rules = skipped.map((s) => s.rule);
    expect(rules).toEqual(
      expect.arrayContaining([
        'category-increase',
        'category-decrease',
        'month-over-month',
        'payday-spike',
        'spending-volatility',
        'large-one-off',
      ]),
    );
    expect(skipped.every((s) => s.reason.length > 0)).toBe(true);
  });

  it('finds category rises and falls against the 3-month average and the month-over-month change', () => {
    const history = [6, 7, 8].flatMap((m) => [
      on(4, 50_000, { categoryId: 'delivery' }, m),
      on(8, 50_000, { categoryId: 'delivery' }, m),
      on(12, 300_000, { categoryId: 'online' }, m),
    ]);
    const now = [
      ...[2, 5, 9, 12, 16, 19, 23, 26].map((d) => on(d, 100_000, { categoryId: 'delivery' })),
      on(14, 50_000, { categoryId: 'online' }),
    ];
    const { insights } = run([...history, ...now]);

    const [rise] = byRule(insights, 'category-increase');
    expect(rise).toMatchObject({ group: 'spending', kind: 'OBSERVATION' });
    expect(rise?.title).toContain('Food');
    expect(rise?.explanation).toContain('mostly because of how often you paid');
    expect(rise?.supportingTransactionIds).toHaveLength(8);

    const [fall] = byRule(insights, 'category-decrease');
    expect(fall).toMatchObject({ severity: 'info', metric: { valuePaise: 250_000 } });
    expect(fall?.title).toBe('Shopping is ₹2,500 below your 3-month average');

    const [mom] = byRule(insights, 'month-over-month-increase');
    expect(mom).toMatchObject({
      kind: 'CALCULATION',
      severity: 'high',
      title: 'Spending rose 113% from last month',
      metric: { valuePaise: 450_000 },
    });
  });

  it('counts small payments', () => {
    const { insights } = run(Array.from({ length: 8 }, (_, i) => on(i + 1, 10_000)));
    expect(byRule(insights, 'small-transactions')[0]).toMatchObject({
      group: 'behaviour',
      metric: { valuePaise: 80_000 },
    });
  });

  it('flags weekend spending well above weekdays', () => {
    // Sat 5, Sun 6 and Sat 12 September; Monday 7.
    const { insights } = run([on(5, 300_000), on(6, 300_000), on(12, 300_000), on(7, 50_000)]);
    const [weekend] = byRule(insights, 'weekend-spending');
    expect(weekend).toMatchObject({ severity: 'medium', metric: { unit: 'x' } });
    expect(weekend?.supportingTransactionIds).toHaveLength(3);
  });

  it('finds a spending spike after payday, leaving out recurring payments', () => {
    const salary = on(1, 10_000_000, { type: 'CREDIT', flow: 'IN', merchantName: 'Employer' });
    const rent = on(1, 3_000_000, { merchantName: 'Landlord' });
    const spree = [1, 2, 3].map((d) => on(d, 300_000));
    const rest = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((d) => on(d, 10_000));
    const { insights } = run(
      [salary, rent, ...spree, ...rest],
      [
        series({ flow: 'IN', label: 'Employer', transactionIds: [salary.id] }),
        series({ label: 'Landlord', transactionIds: [rent.id] }),
      ],
    );
    const [spike] = byRule(insights, 'payday-spike');
    expect(spike).toMatchObject({ severity: 'medium', metric: { value: 30 } });
    expect(spike?.supportingTransactionIds).toEqual(spree.map((t) => t.id));
  });

  it('notes when one merchant or one category dominates', () => {
    const swiggy = [1, 2, 3, 4, 5].map((d) =>
      on(d, 50_000, { merchantName: 'Swiggy', categoryId: 'delivery' }),
    );
    const others = [6, 7, 8, 9, 10, 11].map((d) =>
      on(d, 10_000, { merchantName: `Shop ${d}`, categoryId: d % 2 ? 'online' : 'bills' }),
    );
    const { insights } = run([...swiggy, ...others]);
    expect(byRule(insights, 'merchant-concentration')[0]).toMatchObject({
      title: 'Swiggy took 81% of your everyday spending',
      supportingTransactionIds: swiggy.map((t) => t.id),
    });
    expect(byRule(insights, 'category-concentration')[0]?.title).toBe(
      'Food was 81% of your spending',
    );
  });

  it('measures how much monthly spending moves', () => {
    const { insights } = run([on(10, 100_000, {}, 7), on(10, 300_000, {}, 8), on(10, 200_000)]);
    expect(byRule(insights, 'spending-volatility')[0]).toMatchObject({
      severity: 'medium',
      metric: { value: 0.41 },
    });
  });

  it('groups repeated transfers, refunds and cashback', () => {
    const transfers = [3, 10, 17].map((d) =>
      on(d, 500_000, { type: 'TRANSFER', merchantName: 'Amma' }),
    );
    const { insights } = run([
      ...transfers,
      on(4, 20_000, { type: 'REFUND', flow: 'IN' }),
      on(9, 30_000, { type: 'REFUND', flow: 'IN' }),
      on(11, 5_000, { type: 'CASHBACK', flow: 'IN' }),
      on(12, 5_000, { type: 'SELF_TRANSFER' }),
      on(13, 5_000, { type: 'SELF_TRANSFER' }),
      on(14, 5_000, { type: 'SELF_TRANSFER' }),
    ]);
    expect(byRule(insights, 'repeated-transfers')).toHaveLength(1);
    expect(byRule(insights, 'repeated-transfers')[0]).toMatchObject({
      title: '3 transfers to Amma this month',
      metric: { valuePaise: 1_500_000 },
    });
    expect(byRule(insights, 'refund-pattern')[0]?.metric.valuePaise).toBe(50_000);
    expect(byRule(insights, 'cashback-pattern')[0]?.title).toBe('You earned ₹50 in cashback');
  });

  it('summarises recurring payments, subscriptions, stopped series and what is due next', () => {
    const { insights } = run(
      [on(5, 64_900)],
      [
        series({
          label: 'Rent',
          typicalAmountPaise: 3_000_000,
          monthlyEquivalentPaise: 3_000_000,
          nextExpectedDate: '2026-10-03',
        }),
        series({
          label: 'Netflix',
          typicalAmountPaise: 64_900,
          monthlyEquivalentPaise: 64_900,
          subscriptionLike: true,
        }),
        series({ label: 'Gym', active: false, lastDate: '2026-06-01' }),
      ],
    );
    expect(byRule(insights, 'recurring-payments')[0]).toMatchObject({
      group: 'recurring',
      title: '2 recurring payments were detected',
      metric: { valuePaise: 3_064_900 },
    });
    expect(byRule(insights, 'subscriptions')[0]?.title).toBe(
      '1 subscription-like payment cost ₹649 a month',
    );
    expect(byRule(insights, 'recurring-stopped')[0]?.explanation).toContain(
      'Gym (last on 2026-06-01)',
    );
    expect(byRule(insights, 'upcoming-payments')[0]).toMatchObject({
      group: 'planning',
      metric: { valuePaise: 3_064_900 },
    });
  });

  it('finds a large one-off payment and a payment unusual for its merchant', () => {
    const history = Array.from({ length: 20 }, (_, i) =>
      on((i % 20) + 1, 20_000, {}, i < 10 ? 7 : 8),
    );
    const zomatoBefore = [3, 9, 15, 21].map((d) => on(d, 40_000, { merchantName: 'Zomato' }, 8));
    const big = on(20, 600_000, { merchantName: 'Croma' });
    const odd = on(22, 200_000, { merchantName: 'Zomato' });
    const { insights } = run([...history, ...zomatoBefore, big, odd]);
    expect(byRule(insights, 'large-one-off').map((i) => i.supportingTransactionIds)).toEqual([
      [big.id],
    ]);
    expect(byRule(insights, 'unusual-for-merchant')[0]).toMatchObject({
      group: 'anomalies',
      supportingTransactionIds: [odd.id],
      metric: { value: 5 },
    });
  });

  it('labels every insight and keeps it inside the known groups', () => {
    const txs = [
      ...Array.from({ length: 30 }, (_, i) => on((i % 28) + 1, 15_000 + i * 1000, {}, 8)),
      ...Array.from({ length: 30 }, (_, i) => on((i % 28) + 1, 25_000 + i * 1000)),
    ];
    const { insights } = run(txs);
    expect(insights.length).toBeGreaterThan(0);
    for (const i of insights) {
      expect(['CALCULATION', 'OBSERVATION']).toContain(i.kind);
      expect(INSIGHT_GROUPS).toContain(i.group);
      expect(i.confidence).toBeGreaterThan(0);
      expect(i.confidence).toBeLessThanOrEqual(1);
      expect(i.title).not.toMatch(/waste/i);
    }
    expect(Object.keys(INSIGHT_RULES)).toHaveLength(16);
  });
});
