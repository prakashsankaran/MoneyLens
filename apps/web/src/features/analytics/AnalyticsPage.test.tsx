import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CategoryAnalytics, MonthlyAnalytics } from '@moneylens/types';
import { dashboardFixture } from '../../test/fixtures';
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
      return undefined;
    });
    renderRoute(<AnalyticsPage />);
    expect(
      await screen.findByRole('heading', { name: 'Where did my money go in September 2026?' }),
    ).toBeInTheDocument();
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
