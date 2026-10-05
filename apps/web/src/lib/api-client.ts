import type { ApiFailure, ApiResponse, AuthResult, ErrorCode } from '@moneylens/types';

/** Base path of the API. In development Vite proxies /api to the API server. */
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The access token lives only in memory, never in localStorage, so injected
 * scripts cannot lift it from storage. The refresh token is an httpOnly cookie.
 */
let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

async function parse<T>(res: Response): Promise<T> {
  let body: ApiResponse<T> | null = null;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    // Non-JSON response (e.g. proxy error page).
  }
  if (body && body.success) return body.data;
  const error = (body as ApiFailure | null)?.error;
  throw new ApiError(
    res.status,
    error?.code ?? 'INTERNAL_ERROR',
    error?.message ?? 'Something went wrong. Please try again.',
    error?.details,
  );
}

async function rawRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  // FormData sets its own multipart boundary header.
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });
}

// Concurrent 401s share one refresh request.
let refreshInFlight: Promise<AuthResult | null> | null = null;

/** Exchange the refresh cookie for a new access token. Returns null when signed out. */
export function refreshSession(): Promise<AuthResult | null> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        setAccessToken(null);
        return null;
      }
      const result = await parse<AuthResult>(res);
      setAccessToken(result.accessToken);
      return result;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** Call the API, transparently refreshing an expired access token once. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await rawRequest(path, init);
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const refreshed = await refreshSession();
    if (!refreshed) {
      onSessionExpired?.();
    } else {
      res = await rawRequest(path, init);
    }
  }
  return parse<T>(res);
}

/** JSON request helper for mutations. */
export function send<T>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) {
  return api<T>(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

/** Field errors from a VALIDATION_ERROR response, keyed by field name. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  const fields = error.details?.fields;
  return fields && typeof fields === 'object' ? (fields as Record<string, string>) : {};
}
