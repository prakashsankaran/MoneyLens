import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImportReview } from '@moneylens/types';
import { categoryTree, importReview } from '../../test/fixtures-phase2';
import { mockApi, renderRoute } from '../../test/render';
import { ImportReviewPage } from './ImportReviewPage';

afterEach(() => vi.unstubAllGlobals());

function setup(review: ImportReview = importReview) {
  return mockApi(({ method, url, body }) => {
    if (url.includes('/categories')) return { data: categoryTree };
    if (method === 'PATCH' && url.includes('/rows/r1')) {
      const row = { ...review.rows[0]!, ...(body as object) };
      return { data: { row, stats: { ...review.stats, included: 0, excluded: 2 } } };
    }
    if (method === 'POST' && url.endsWith('/confirm')) {
      return { data: { import: { ...review.import, status: 'CONFIRMED' }, committed: 1 } };
    }
    if (url.includes('/imports/imp1')) return { data: review };
    return undefined;
  });
}

const renderPage = () =>
  renderRoute(<ImportReviewPage />, { url: '/imports/imp1', path: '/imports/:id' });

describe('ImportReviewPage', () => {
  it('summarises the file and flags rows that need a look', async () => {
    setup();
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Review import' })).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Import summary' });
    expect(within(summary).getByText('Possible duplicates').nextSibling).toHaveTextContent('1');
    expect(screen.getByText('Dates were read as day/month/year.')).toBeInTheDocument();
    expect(screen.getByText(/Possible duplicate: Same reference number/)).toBeInTheDocument();
    // The duplicate is not included by default.
    expect(screen.getByRole('checkbox', { name: /Import Zomato/ })).not.toBeChecked();

    await userEvent.click(screen.getByRole('tab', { name: /Needs a look/ }));
    expect(screen.queryByText('Swiggy')).not.toBeInTheDocument();
    expect(screen.getByText('Zomato')).toBeInTheDocument();
  });

  it('excludes a row and updates the totals from the server', async () => {
    const calls = setup();
    renderPage();
    await userEvent.click(await screen.findByRole('checkbox', { name: /Import Swiggy/ }));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ decision: 'EXCLUDE' });
    expect(
      await screen.findByText('0 of 2 rows will be added to your transactions.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import 0 transactions' })).toBeDisabled();
  });

  it('confirms the import and links onward', async () => {
    setup();
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Import 1 transactions' }));
    expect(await screen.findByText('1 transactions imported')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View transactions' })).toHaveAttribute(
      'href',
      '/transactions',
    );
  });

  it('explains files that could not be read', async () => {
    setup({
      ...importReview,
      import: {
        ...importReview.import,
        status: 'FAILED',
        errorMessage: 'No transactions were found in this file.',
      },
      rows: [],
    });
    renderPage();
    expect(await screen.findByText(/couldn't read hdfc.csv/)).toBeInTheDocument();
    expect(screen.getByText('No transactions were found in this file.')).toBeInTheDocument();
  });
});
