import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { LoginPage } from './LoginPage';

function renderLogin(fetchImpl: typeof fetch) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const unauthenticated = () =>
  new Response(
    JSON.stringify({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Email or password is incorrect' },
    }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  );

describe('LoginPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('validates fields before calling the API', async () => {
    renderLogin(async () => unauthenticated());
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
  });

  it('shows the server error for bad credentials', async () => {
    renderLogin(async () => unauthenticated());
    await userEvent.type(await screen.findByLabelText('Email'), 'aarav@example.test');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect');
  });
});
