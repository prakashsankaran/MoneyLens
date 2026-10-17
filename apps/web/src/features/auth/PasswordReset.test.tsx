import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authResult } from '../../test/render';
import { AuthProvider } from './AuthProvider';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { RegisterPage } from './RegisterPage';
import { ResetPasswordPage } from './ResetPasswordPage';

const KEY = 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01';
const NEW_KEY = '2345-6789-ABCD-EFGH-JKMN-PQRS';

const json = (status: number, data: unknown) =>
  new Response(
    JSON.stringify(status < 400 ? { success: true, data } : { success: false, error: data }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    },
  );

type Reply = [status: number, data: unknown];

/** Signed out; `routes` answers API paths (after /api). */
function renderAt(path: string, routes: Record<string, (body: unknown) => Reply>) {
  const calls: { path: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const apiPath = String(input).replace(/^.*\/api/, '');
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null;
      calls.push({ path: apiPath, body });
      const handler = routes[apiPath];
      if (handler) return json(...handler(body));
      return json(401, { code: 'UNAUTHENTICATED', message: 'Signed out' });
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<p>Dashboard</p>} />
            <Route path="/login" element={<p>Sign in page</p>} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return calls;
}

describe('recovery key after sign-up', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is shown once, and the app opens after the owner says it is saved', async () => {
    renderAt('/register', {
      '/auth/signup': () => [200, { mode: 'open' }],
      '/auth/register': () => [201, { ...authResult, recoveryKey: KEY }],
    });
    await userEvent.type(await screen.findByLabelText('Name'), 'Asha');
    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.test');
    await userEvent.type(screen.getByLabelText('Password'), 'a-long-passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Save your recovery key')).toBeInTheDocument();
    expect(screen.getByTestId('recovery-key')).toHaveTextContent(KEY);
    const open = screen.getByRole('button', { name: 'Open MoneyLens' });
    expect(open).toBeDisabled();
    await userEvent.click(screen.getByLabelText('I have saved my recovery key'));
    await userEvent.click(open);
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });
});

describe('ForgotPasswordPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resets with the recovery key and shows the new key', async () => {
    const calls = renderAt('/forgot-password', {
      '/auth/reset-options': () => [200, { email: false }],
      '/auth/reset-password/recovery-key': () => [200, { ...authResult, recoveryKey: NEW_KEY }],
    });
    // Without email set up, there is no email tab.
    expect(await screen.findByText('Forgot your password?')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Email link' })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.test');
    await userEvent.type(screen.getByLabelText('Recovery key'), 'abcd efgh jkmn pqrs tvwx yz01');
    await userEvent.type(screen.getByLabelText('New password'), 'a brand new phrase');
    await userEvent.click(screen.getByRole('button', { name: 'Set new password' }));

    expect(await screen.findByText('Password changed')).toBeInTheDocument();
    expect(screen.getByTestId('recovery-key')).toHaveTextContent(NEW_KEY);
    expect(calls.find((c) => c.path === '/auth/reset-password/recovery-key')?.body).toEqual({
      email: 'asha@example.test',
      recoveryKey: 'ABCDEFGHJKMNPQRSTVWXYZ01',
      newPassword: 'a brand new phrase',
    });
  });

  it('shows a wrong key next to the field', async () => {
    renderAt('/forgot-password', {
      '/auth/reset-options': () => [200, { email: false }],
      '/auth/reset-password/recovery-key': () => [
        400,
        {
          code: 'VALIDATION_ERROR',
          message: 'That email and recovery key do not match.',
          details: { fields: { recoveryKey: 'That email and recovery key do not match.' } },
        },
      ],
    });
    await userEvent.type(await screen.findByLabelText('Email'), 'asha@example.test');
    await userEvent.type(screen.getByLabelText('Recovery key'), KEY);
    await userEvent.type(screen.getByLabelText('New password'), 'a brand new phrase');
    await userEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(
      await screen.findByText('That email and recovery key do not match.'),
    ).toBeInTheDocument();
  });

  it('emails a link when the server can send email', async () => {
    const calls = renderAt('/forgot-password', {
      '/auth/reset-options': () => [200, { email: true }],
      '/auth/forgot-password': () => [200, { requested: true }],
    });
    await userEvent.click(await screen.findByRole('tab', { name: 'Email link' }));
    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Email me a reset link' }));
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/auth/forgot-password')?.body).toEqual({
      email: 'asha@example.test',
    });
  });
});

describe('ResetPasswordPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it('sets the new password with the token from the link and signs in', async () => {
    window.history.replaceState(null, '', '/reset-password#token=abcdefghijklmnopqrstuvwxyz');
    const calls = renderAt('/reset-password', {
      '/auth/reset-password': () => [200, authResult],
    });
    // The token is taken out of the address bar.
    expect(window.location.hash).toBe('');
    await userEvent.type(await screen.findByLabelText('New password'), 'a brand new phrase');
    await userEvent.type(screen.getByLabelText('Type it again'), 'a brand new phrase');
    await userEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/auth/reset-password')?.body).toEqual({
      token: 'abcdefghijklmnopqrstuvwxyz',
      newPassword: 'a brand new phrase',
    });
  });

  it('explains a link without a token', async () => {
    renderAt('/reset-password', {});
    expect(await screen.findByText("This link can't be used")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ask for a new link' })).toBeInTheDocument();
  });
});
