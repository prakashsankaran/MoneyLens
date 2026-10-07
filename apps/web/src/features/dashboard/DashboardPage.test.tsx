import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthResult, DashboardData, MoneyBrief } from '@moneylens/types';
import { AuthProvider } from '../auth/AuthProvider';
import { dashboardFixture } from '../../test/fixtures';
import { DashboardPage } from './DashboardPage';

const authResult: AuthResult = {
  user: {
    id: 'u1',
    email: 'aarav@example.test',
    name: 'Aarav Mehta',
    createdAt: '2026-01-01T00:00:00Z',
  },
  accessToken: 'token',
  expiresIn: 900,
};

const briefFixture: MoneyBrief = {
  month: '2026-09',
  status: 'answered',
  facts: [{ kind: 'CALCULATION', text: 'In September 2026 you received ₹1,45,000.' }],
  text: 'Most of your money went on housing this month.',
  provider: 'mock/mock',
  generatedAt: '2026-10-05T09:00:00Z',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(status < 400 ? { success: true, data } : data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockApi(dashboard: (url: string) => DashboardData) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/auth/refresh')) return json(authResult);
    if (url.includes('/dashboard')) return json(dashboard(url));
    if (url.includes('/ai/brief')) return json(briefFixture);
    return json({ success: false, error: { code: 'NOT_FOUND', message: 'nope' } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <DashboardPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DashboardPage', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('renders the API figures and asks questions as section titles', async () => {
    mockApi(() => dashboardFixture);
    renderPage();
    expect(await screen.findByText('Your money in September 2026')).toBeInTheDocument();
    expect(screen.getByText(/Aarav$/)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Where did my money go in September 2026?' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'How has my spending changed over the last 6 months?' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Swiggy')).toBeInTheDocument();
    // The brief is labelled as AI interpretation and lists the figures it came from.
    expect(await screen.findByText(/Most of your money went on housing/)).toBeInTheDocument();
    expect(screen.getByText('AI interpretation')).toBeInTheDocument();
    expect(screen.getByText('Written from these figures')).toBeInTheDocument();
  });

  it('requests another month when the selector changes', async () => {
    const fetchMock = mockApi((url) =>
      url.includes('month=2026-08') ? { ...dashboardFixture, month: '2026-08' } : dashboardFixture,
    );
    renderPage();
    const select = await screen.findByRole('combobox');
    await userEvent.selectOptions(select, '2026-08');
    expect(await screen.findByText('Your money in August 2026')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/dashboard?month=2026-08'))).toBe(
      true,
    );
  });

  it('shows an empty state for a new account', async () => {
    mockApi(() => ({ ...dashboardFixture, availableMonths: [], categories: [], observations: [] }));
    renderPage();
    expect(await screen.findByText('No transactions yet')).toBeInTheDocument();
  });

  it('can switch the trend chart to an accessible table', async () => {
    mockApi(() => dashboardFixture);
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Show as table' }));
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    expect(screen.getByRole('cell', { name: 'July 2026' })).toBeInTheDocument();
  });
});
