import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderRoute } from '../../test/render';
import { MerchantsCard } from './MerchantsCard';

afterEach(() => vi.unstubAllGlobals());

const merchants = [
  { id: 'm1', name: 'Swiggy', transactionCount: 4 },
  { id: 'm2', name: 'Swiggy Instamart', transactionCount: 1 },
  { id: 'm3', name: 'Zomato', transactionCount: 2 },
];

describe('MerchantsCard', () => {
  it('renames and merges merchants', async () => {
    const calls = mockApi(({ method, url }) => {
      if (method === 'PATCH') return { data: { ...merchants[0], name: 'Swiggy Food' } };
      if (method === 'POST' && url.endsWith('/merge')) return { data: merchants[0] };
      if (url.endsWith('/merchants')) return { data: merchants };
      return undefined;
    });
    renderRoute(<MerchantsCard />);

    await userEvent.type(await screen.findByLabelText('Find a merchant'), 'insta');
    expect(screen.queryByText('Zomato')).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Find a merchant'));

    await userEvent.click(screen.getByRole('button', { name: 'Rename Swiggy' }));
    const input = screen.getByLabelText('New name for Swiggy');
    await userEvent.clear(input);
    await userEvent.type(input, 'Swiggy Food');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Merge Swiggy Instamart' }));
    expect(screen.getByRole('button', { name: 'Merge' })).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText(/Merge Swiggy Instamart into/), 'Swiggy');
    expect(
      screen.getByText(/The 1 transaction from Swiggy Instamart will move to Swiggy/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }));

    const writes = calls.filter((c) => c.method !== 'GET' && c.url.includes('/merchants'));
    expect(writes.map((c) => [c.method, c.url.replace(/^.*\/api/, ''), c.body])).toEqual([
      ['PATCH', '/merchants/m1', { name: 'Swiggy Food' }],
      ['POST', '/merchants/m2/merge', { intoId: 'm1' }],
    ]);
  });
});
