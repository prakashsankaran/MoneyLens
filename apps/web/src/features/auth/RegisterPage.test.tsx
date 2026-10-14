import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SignupMode } from '@moneylens/types';
import { AuthProvider } from './AuthProvider';
import { RegisterPage } from './RegisterPage';

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Signed out, with the server answering sign-up in `mode`. */
function renderRegister(mode: SignupMode, onRegister = vi.fn()) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/signup')) return json(200, { success: true, data: { mode } });
      if (url.endsWith('/auth/register')) {
        onRegister(JSON.parse(String(init?.body)));
        return json(403, {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'That invite code is not valid.',
            details: { field: 'inviteCode' },
          },
        });
      }
      return json(401, { success: false, error: { code: 'UNAUTHENTICATED', message: 'No' } });
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <AuthProvider>
          <RegisterPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RegisterPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for an invite code when the server needs one and shows its error there', async () => {
    const onRegister = vi.fn();
    renderRegister('invite', onRegister);
    await userEvent.type(await screen.findByLabelText('Invite code'), 'wrong-code-1');
    await userEvent.type(screen.getByLabelText('Name'), 'Asha');
    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.test');
    await userEvent.type(screen.getByLabelText('Password'), 'a-long-passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('That invite code is not valid.')).toBeInTheDocument();
    expect(onRegister).toHaveBeenCalledWith(
      expect.objectContaining({ inviteCode: 'wrong-code-1' }),
    );
  });

  it('has no invite field when sign-up is open', async () => {
    renderRegister('open');
    expect(await screen.findByRole('button', { name: 'Create account' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Invite code')).not.toBeInTheDocument();
  });

  it('says so when sign-up is closed', async () => {
    renderRegister('closed');
    expect(await screen.findByText('Sign-up is closed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create account' })).not.toBeInTheDocument();
  });
});
