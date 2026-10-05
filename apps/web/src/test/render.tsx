import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { vi } from 'vitest';
import type { AuthResult } from '@moneylens/types';
import { AuthProvider } from '../features/auth/AuthProvider';

export const authResult: AuthResult = {
  user: {
    id: 'u1',
    email: 'aarav@example.test',
    name: 'Aarav Mehta',
    createdAt: '2026-01-01T00:00:00Z',
  },
  accessToken: 'token',
  expiresIn: 900,
};

export interface RecordedCall {
  method: string;
  url: string;
  body: unknown;
}

type Handler = (
  call: RecordedCall,
) => { status?: number; data?: unknown; error?: unknown } | undefined;

/**
 * Stub fetch with a single handler. Return `{ data }` for success,
 * `{ status, error }` for failure, or undefined for a 404.
 */
export function mockApi(handler: Handler) {
  const calls: RecordedCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : (init?.body ?? null);
    const call = { method, url, body };
    calls.push(call);
    const result = url.endsWith('/auth/refresh') ? { data: authResult } : handler(call);
    const status = result?.status ?? (result ? 200 : 404);
    const payload =
      status < 400
        ? { success: true, data: result?.data ?? null }
        : { success: false, error: result?.error ?? { code: 'NOT_FOUND', message: 'Not found' } };
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

/** Render a page inside the app's providers at `url`, matched against `path`. */
export function renderRoute(ui: ReactElement, { url = '/', path = '*' } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <AuthProvider>
          <Routes>
            <Route path={path} element={ui} />
            <Route path="*" element={<p>Navigated away</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
