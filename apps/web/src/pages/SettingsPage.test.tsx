import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { categoryTree } from '../test/fixtures-phase2';
import { mockApi, renderRoute } from '../test/render';
import { SettingsPage } from './SettingsPage';

afterEach(() => vi.unstubAllGlobals());

describe('SettingsPage', () => {
  it('lists the user’s own categories separately from built-in ones', async () => {
    mockApi(({ url }) => (url.includes('/categories') ? { data: categoryTree } : undefined));
    renderRoute(<SettingsPage />);
    expect(await screen.findByRole('button', { name: 'Rename Pets' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename Food' })).not.toBeInTheDocument();
    expect(screen.getByText('Built-in categories (1)')).toBeInTheDocument();
  });

  it('only deletes all transactions after DELETE is typed', async () => {
    const calls = mockApi(({ method, url }) => {
      if (url.includes('/categories')) return { data: categoryTree };
      if (method === 'DELETE' && url.endsWith('/transactions')) {
        return { data: { deleted: { transactions: 12, imports: 1 } } };
      }
      return undefined;
    });
    renderRoute(<SettingsPage />);
    const button = await screen.findByRole('button', { name: 'Delete all transactions' });
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await userEvent.click(button);
    expect(await screen.findByText('Deleted 12 transactions.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'DELETE')?.body).toEqual({ confirm: 'DELETE' });
  });

  it('shows a wrong password when deleting the account', async () => {
    mockApi(({ method, url }) => {
      if (url.includes('/categories')) return { data: categoryTree };
      if (method === 'DELETE' && url.endsWith('/auth/account')) {
        return {
          status: 400,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Password is incorrect',
            details: { fields: { password: 'Password is incorrect' } },
          },
        };
      }
      return undefined;
    });
    renderRoute(<SettingsPage />);
    await userEvent.type(await screen.findByLabelText('Your password'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(await screen.findByText('Password is incorrect')).toBeInTheDocument();
  });
});
