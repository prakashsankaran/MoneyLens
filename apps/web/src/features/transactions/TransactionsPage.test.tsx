import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  categoryTree,
  salary,
  swiggy,
  swiggyDetail,
  transactionList,
} from '../../test/fixtures-phase2';
import { mockApi, renderRoute } from '../../test/render';
import { TransactionsPage } from './TransactionsPage';

afterEach(() => vi.unstubAllGlobals());

function defaultHandler(list = transactionList([swiggy, salary])) {
  return mockApi(({ method, url }) => {
    if (url.includes('/categories')) return { data: categoryTree };
    if (url.includes('/merchants')) return { data: [] };
    if (method === 'GET' && url.includes('/transactions/t1')) return { data: swiggyDetail };
    if (method === 'PATCH' && url.includes('/transactions/t1')) {
      return {
        data: {
          transaction: { ...swiggyDetail, category: { id: 'food', name: 'Food', slug: 'food' } },
          alsoUpdated: 4,
        },
      };
    }
    if (url.includes('/transactions')) return { data: list };
    return undefined;
  });
}

describe('TransactionsPage', () => {
  it('lists transactions with signed amounts and calculated totals', async () => {
    defaultHandler();
    renderRoute(<TransactionsPage />);
    expect((await screen.findAllByText('Swiggy')).length).toBeGreaterThan(0);
    expect(
      screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '2 transactions'),
    ).toBeInTheDocument();
    // Money in is marked as received, money out as paid.
    expect(screen.getAllByText(/₹1,45,000\.00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Uncategorised').length).toBeGreaterThan(0);
    expect(screen.getByText('Calculated')).toBeInTheDocument();
  });

  it('sends search and filters to the API from the URL', async () => {
    const calls = defaultHandler();
    renderRoute(<TransactionsPage />, { url: '/?flow=OUT&from=2026-09-01' });
    await screen.findAllByText('Swiggy');
    expect(
      calls.some((c) => c.url.includes('/transactions?from=2026-09-01&flow=OUT&pageSize=25')),
    ).toBe(true);

    await userEvent.type(screen.getByPlaceholderText(/Search merchant/), 'swig');
    await waitFor(() => expect(calls.some((c) => c.url.includes('q=swig'))).toBe(true));
  });

  it('shows an import prompt when there is nothing yet', async () => {
    defaultHandler(transactionList([], 0));
    renderRoute(<TransactionsPage />);
    expect(await screen.findByText('No transactions yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Imports' })).toHaveAttribute('href', '/imports');
  });

  it('opens the detail and applies a category to the merchant', async () => {
    const calls = defaultHandler();
    renderRoute(<TransactionsPage />);
    const [link] = await screen.findAllByRole('button', { name: 'Swiggy' });
    await userEvent.click(link!);

    const dialog = await screen.findByRole('dialog', { name: 'Transaction' });
    expect(within(dialog).getByText('sw•••@icici')).toBeInTheDocument();
    expect(within(dialog).getByText(/Suggested automatically/)).toBeInTheDocument();

    await userEvent.selectOptions(within(dialog).getByRole('combobox'), 'restaurants');
    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: /every Swiggy transaction/ }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await within(dialog).findByText(/4 other transactions/)).toBeInTheDocument();
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.body).toEqual({ categoryId: 'restaurants', applyToMerchant: true });
  });

  it('asks before deleting', async () => {
    const calls = defaultHandler();
    renderRoute(<TransactionsPage />);
    const [link] = await screen.findAllByRole('button', { name: 'Swiggy' });
    await userEvent.click(link!);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete transaction' }));
    expect(within(dialog).getByText(/cannot be undone/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });
});
