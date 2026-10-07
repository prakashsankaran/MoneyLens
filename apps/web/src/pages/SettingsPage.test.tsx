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

  it('shows recent sign-in activity with the device and flags failures', async () => {
    mockApi(({ url }) => {
      if (url.includes('/categories')) return { data: categoryTree };
      if (url.endsWith('/auth/activity')) {
        return {
          data: [
            {
              type: 'LOGIN_FAILED',
              at: '2026-10-07T08:30:00.000Z',
              userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
            },
            { type: 'LOGIN_SUCCEEDED', at: '2026-10-06T04:00:00.000Z', userAgent: 'okhttp/4.12.0' },
          ],
        };
      }
      return undefined;
    });
    renderRoute(<SettingsPage />);
    expect(await screen.findByText('Wrong password entered')).toBeInTheDocument();
    expect(screen.getByText(/Firefox on Windows/)).toBeInTheDocument();
    expect(screen.getByText(/MoneyLens app on Android/)).toBeInTheDocument();
    expect(screen.getByLabelText('Worth a look')).toBeInTheDocument();
  });

  it('checks the new password before sending it', async () => {
    const calls = mockApi(({ url }) =>
      url.includes('/categories') ? { data: categoryTree } : undefined,
    );
    renderRoute(<SettingsPage />);
    await userEvent.type(await screen.findByLabelText('Current password'), 'old password 1');
    await userEvent.type(screen.getByLabelText('New password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Use at least 10 characters')).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/auth/password'))).toBe(false);
  });

  it('shows a wrong current password from the server', async () => {
    mockApi(({ method, url }) => {
      if (url.includes('/categories')) return { data: categoryTree };
      if (method === 'POST' && url.endsWith('/auth/password')) {
        return {
          status: 400,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Current password is incorrect',
            details: { fields: { currentPassword: 'Current password is incorrect' } },
          },
        };
      }
      return undefined;
    });
    renderRoute(<SettingsPage />);
    await userEvent.type(await screen.findByLabelText('Current password'), 'not it at all');
    await userEvent.type(screen.getByLabelText('New password'), 'a brand new passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();
  });
});
