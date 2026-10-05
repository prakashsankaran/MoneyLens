import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TransactionList } from '@moneylens/types';
import { healthFixture, insightsFixture, recurringFixture } from '../../test/fixtures-phase4';
import { mockApi, renderRoute } from '../../test/render';
import { InsightsPage } from './InsightsPage';

afterEach(() => vi.unstubAllGlobals());

const evidence: TransactionList = {
  items: [
    {
      id: 't1',
      date: '2026-09-04T13:00:00.000Z',
      amountPaise: 45_000,
      currency: 'INR',
      type: 'DEBIT',
      flow: 'OUT',
      merchantId: 'm1',
      merchantName: 'Swiggy',
      description: null,
      category: null,
      subcategory: null,
      paymentMethod: 'UPI',
      source: 'CSV',
      status: 'CONFIRMED',
      isRecurring: false,
      notes: null,
      upiIdMasked: null,
      referenceMasked: null,
      categoryConfidence: null,
    },
  ],
  page: 1,
  pageSize: 100,
  total: 1,
  summary: {
    incomePaise: 0,
    grossSpendingPaise: 45_000,
    refundsPaise: 0,
    spendingPaise: 45_000,
    cashbackPaise: 0,
    savedPaise: -45_000,
    savingsRatePct: null,
    spendTransactionCount: 1,
    averageSpendPaise: 45_000,
    medianSpendPaise: 45_000,
  },
};

function api() {
  let recurring = recurringFixture;
  return mockApi(({ url, method, body }) => {
    if (url.includes('/insights')) return { data: insightsFixture };
    if (url.includes('/analytics/health')) return { data: healthFixture };
    if (url.includes('/transactions?ids=')) return { data: evidence };
    if (url.endsWith('/recurring') && method === 'GET') return { data: recurring };
    if (url.includes('/recurring/r2') && method === 'PATCH') {
      const dismissed = (body as { dismissed: boolean }).dismissed;
      recurring = {
        ...recurringFixture,
        monthlyOutgoingPaise: 64_900,
        items: recurringFixture.items.map((i) => (i.id === 'r2' ? { ...i, dismissed } : i)),
      };
      return { data: recurring };
    }
    return undefined;
  });
}

describe('InsightsPage', () => {
  it('shows each insight with its label, metric, confidence, saving and suggestion', async () => {
    api();
    renderRoute(<InsightsPage />);
    const card = (await screen.findByText(/12 food delivery orders/)).closest('article');
    expect(card).not.toBeNull();
    const c = within(card as HTMLElement);
    expect(c.getByText('Observation')).toBeInTheDocument();
    expect(c.getByText('Notable')).toBeInTheDocument();
    expect(c.getByText('₹9,000')).toBeInTheDocument();
    expect(c.getByText('₹2,100 a month')).toBeInTheDocument();
    expect(c.getByText('Medium (75%)')).toBeInTheDocument();
    expect(c.getByText('Suggestion')).toBeInTheDocument();
    expect(c.getByText(/Bringing food delivery back/)).toBeInTheDocument();
    expect(screen.getByText('1.8x')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/waste/i);
  });

  it('loads the transactions behind an insight on request', async () => {
    const calls = api();
    renderRoute(<InsightsPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Show the 2 transactions behind this' }),
    );
    expect(await screen.findByText('Swiggy')).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/transactions?ids=t1,t2'))).toBe(true);
  });

  it('filters by group and lists recurring payments with a dismiss action', async () => {
    const calls = api();
    renderRoute(<InsightsPage />);
    await userEvent.click(await screen.findByRole('tab', { name: /Behaviour 1/ }));
    expect(screen.queryByText(/12 food delivery orders/)).not.toBeInTheDocument();
    expect(screen.getByText(/weekend spending is 1.8x/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Recurring 0/ }));
    expect(screen.getByText('No recurring payments found.')).toBeInTheDocument();
    expect(await screen.findByText('Netflix')).toBeInTheDocument();
    expect(screen.getByText(/₹768 a month/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Not recurring: Spotify' }));
    expect(await screen.findByText('Marked not recurring')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore Spotify' })).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ dismissed: true });
  });

  it('shows the health score with its working and the checks that could not run', async () => {
    api();
    renderRoute(<InsightsPage />);
    expect(await screen.findByText('78')).toBeInTheDocument();
    expect(screen.getByText(/38.0% of income saved/)).toBeInTheDocument();
    expect(screen.getByText('Needs at least 3 months of data.')).toBeInTheDocument();
    expect(screen.getAllByText('Not scored')).toHaveLength(2);
    expect(screen.getByText('1 check could not run this month')).toBeInTheDocument();
  });

  it('prompts an import when there is no data', async () => {
    mockApi(({ url }) =>
      url.includes('/insights')
        ? { data: { ...insightsFixture, availableMonths: [], insights: [] } }
        : undefined,
    );
    renderRoute(<InsightsPage />);
    expect(await screen.findByText('No insights yet')).toBeInTheDocument();
  });
});
