import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CategoryAnalytics, MonthlyAnalytics, PeriodAnalytics } from '@moneylens/types';
import { dashboardFixture } from '../../test/fixtures';
import { comparisonsFixture } from '../../test/fixtures-phase4';
import { mockApi, renderRoute } from '../../test/render';
import { AnalyticsPage } from './AnalyticsPage';

afterEach(() => vi.unstubAllGlobals());

const monthly: MonthlyAnalytics = {
  month: '2026-09',
  availableMonths: ['2026-08', '2026-09'],
  totals: dashboardFixture.totals,
  comparison: dashboardFixture.comparison,
};
const food = {
  categoryId: 'food',
  name: 'Food',
  slug: 'food',
  color: null,
  amountPaise: 2_000_000,
  sharePct: 60,
  transactionCount: 30,
};
const top: CategoryAnalytics = { month: '2026-09', parent: null, items: [food] };
const sub: CategoryAnalytics = {
  month: '2026-09',
  parent: { id: 'food', name: 'Food', slug: 'food' },
  items: [
    {
      ...food,
      categoryId: 'food-delivery',
      name: 'Food Delivery',
      slug: 'food-delivery',
      sharePct: 100,
    },
  ],
};

describe('AnalyticsPage', () => {
  it('drills from a category into its subcategories and links to the transactions', async () => {
    const calls = mockApi(({ url }) => {
      if (url.includes('/analytics/monthly')) return { data: monthly };
      if (url.includes('/analytics/categories'))
        return { data: url.includes('parentId=food') ? sub : top };
      if (url.includes('/analytics/merchants')) return { data: { month: '2026-09', items: [] } };
      if (url.includes('/analytics/trends')) return { data: { points: dashboardFixture.trend } };
      if (url.includes('/analytics/comparisons')) return { data: comparisonsFixture };
      return undefined;
    });
    renderRoute(<AnalyticsPage />);
    expect(
      await screen.findByRole('heading', { name: 'Where did my money go in September 2026?' }),
    ).toBeInTheDocument();
    // Period comparisons and weekday patterns.
    expect(await screen.findByText('Up 13%')).toBeInTheDocument();
    expect(screen.getByText('No earlier data')).toBeInTheDocument();
    expect(
      screen.getByText(/weekends averaged ₹1,800 and weekdays ₹1,000 \(1.8x\)/),
    ).toBeInTheDocument();
    expect(screen.getByText('Croma')).toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole('button', { name: /Food: .*Show subcategories/ }),
    );
    expect(
      await screen.findByRole('heading', { name: 'What made up Food in September 2026?' }),
    ).toBeInTheDocument();
    expect(
      calls.some((c) => c.url.includes('/analytics/categories?month=2026-09&parentId=food')),
    ).toBe(true);
    expect(screen.getByRole('link', { name: /Food Delivery/ })).toHaveAttribute(
      'href',
      '/transactions?from=2026-09-01&to=2026-09-30&categoryId=food-delivery',
    );
  });

  it('analyses a longer period chosen from the period chips', async () => {
    const calls = mockApi(({ url }) => {
      if (url.includes('/analytics/monthly')) return { data: monthly };
      if (url.includes('/analytics/period')) return { data: periodFixture };
      if (url.includes('/analytics/comparisons')) return { data: comparisonsFixture };
      return { data: { items: [], points: [] } };
    });
    renderRoute(<AnalyticsPage />, { url: '/analytics?period=6m' });
    expect(await screen.findByText('Apr – Sep 2026')).toBeInTheDocument();
    expect(
      calls.some((c) =>
        c.url.includes('/analytics/period?from=2026-04-01&to=2026-09-30&compare=previous'),
      ),
    ).toBe(true);
    expect(screen.getByRole('button', { name: '6 months' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('▲ 10% vs previous 6 months')).toBeInTheDocument();
    expect(screen.getByText('Spent per month')).toBeInTheDocument();
    expect(screen.getByText(/Your imports cover 5 of the 6 months/)).toBeInTheDocument();
    expect(screen.getByText(/only 2 of its 6 months have data/)).toBeInTheDocument();
    expect(screen.getByText('₹20,000 → ₹26,000')).toBeInTheDocument();
    expect(screen.getByText('Infosys Payroll')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Food: .*Show subcategories/ }));
    expect(await screen.findByRole('heading', { name: 'What made up Food?' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Food Delivery/ })).toHaveAttribute(
      'href',
      '/transactions?from=2026-04-01&to=2026-09-30&categoryId=food-delivery',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Month' }));
    expect(
      await screen.findByRole('heading', { name: 'Where did my money go in September 2026?' }),
    ).toBeInTheDocument();
  });

  it('checks a custom range before showing it', async () => {
    const calls = mockApi(({ url }) => {
      if (url.includes('/analytics/monthly')) return { data: monthly };
      if (url.includes('/analytics/period')) return { data: periodFixture };
      if (url.includes('/analytics/comparisons')) return { data: comparisonsFixture };
      return { data: { items: [], points: [] } };
    });
    renderRoute(<AnalyticsPage />, { url: '/analytics' });
    await userEvent.click(await screen.findByRole('button', { name: 'Custom' }));
    const from = screen.getByLabelText('From');
    const to = screen.getByLabelText('To');
    expect(from).toHaveValue('2026-07-01');
    expect(to).toHaveValue('2026-09-30');
    await userEvent.clear(from);
    await userEvent.type(from, '2026-10-05');
    expect(screen.getByRole('alert')).toHaveTextContent('start date must be on or before');
    expect(screen.getByRole('button', { name: 'Show' })).toBeDisabled();
    await userEvent.clear(from);
    await userEvent.type(from, '2026-01-15');
    await userEvent.click(screen.getByRole('button', { name: 'Show' }));
    await vi.waitFor(() =>
      expect(
        calls.some((c) => c.url.includes('/analytics/period?from=2026-01-15&to=2026-09-30')),
      ).toBe(true),
    );
  });

  it('prompts an import when there is no data', async () => {
    mockApi(({ url }) =>
      url.includes('/analytics/monthly')
        ? { data: { ...monthly, availableMonths: [] } }
        : { data: { items: [], points: [] } },
    );
    renderRoute(<AnalyticsPage />);
    expect(await screen.findByText('Nothing to analyse yet')).toBeInTheDocument();
  });
});

const periodFixture: PeriodAnalytics = {
  from: '2026-04-01',
  to: '2026-09-30',
  days: 183,
  wholeMonths: true,
  availableMonths: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'],
  months: ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'],
  monthsWithData: 5,
  totals: { ...dashboardFixture.totals, spendingPaise: 22_000_000, incomePaise: 50_000_000 },
  previous: {
    from: '2025-10-01',
    to: '2026-03-31',
    hasData: true,
    compare: 'previous',
    months: 6,
    monthsWithData: 2,
  },
  previousTotals: dashboardFixture.totals,
  incomeChangePct: 0,
  spendingChangePct: 10,
  savedChangePaise: -200_000,
  averages: {
    monthlyIncomePaise: 10_000_000,
    monthlySpendingPaise: 4_400_000,
    monthlySavedPaise: 5_600_000,
    dailySpendingPaise: 144_000,
  },
  trend: dashboardFixture.trend,
  highestMonth: dashboardFixture.trend[0] ?? null,
  lowestMonth: dashboardFixture.trend[1] ?? null,
  categories: [food],
  subcategories: { food: sub.items },
  categoryTrend: {
    series: [{ key: 'food', categoryId: 'food', name: 'Food' }],
    points: [{ month: '2026-09', values: { food: 2_000_000 } }],
  },
  categoryChanges: [
    {
      categoryId: 'food',
      name: 'Food',
      slug: 'food',
      currentPaise: 2_600_000,
      previousPaise: 2_000_000,
      changePaise: 600_000,
      changePct: 30,
    },
  ],
  merchants: [],
  incomeSources: [
    { merchantId: 'm1', name: 'Infosys Payroll', amountPaise: 50_000_000, transactionCount: 6 },
  ],
  patterns: {
    ...comparisonsFixture.patterns,
  },
};
