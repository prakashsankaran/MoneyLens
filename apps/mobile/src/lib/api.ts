import {
  MOBILE_CLIENT_HEADER,
  type ApiFailure,
  type ApiResponse,
  type AuthResult,
  type ErrorCode,
} from '@moneylens/types';
import { apiBaseUrl } from './config';
import { clearRefreshToken, readRefreshToken, saveRefreshToken } from './token-store';

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

/** The phone could not reach the API at all (wrong address, server down, offline). */
export class NetworkError extends Error {
  constructor(readonly url: string) {
    super(
      `Can't reach MoneyLens at ${url}. Check that the API is running and the phone is online.`,
    );
    this.name = 'NetworkError';
  }
}

/**
 * The access token stays in memory only. The refresh token is in secure
 * storage (see token-store) and is sent to the API in the request body.
 */
let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

/** Store a new session: access token in memory, refresh token in secure storage. */
export async function acceptSession(result: AuthResult): Promise<void> {
  accessToken = result.accessToken;
  if (result.refreshToken) await saveRefreshToken(result.refreshToken);
}

export async function forgetSession(): Promise<void> {
  accessToken = null;
  await clearRefreshToken();
}

async function parse<T>(res: Response): Promise<T> {
  let body: ApiResponse<T> | null = null;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    // Not JSON (a proxy error page, for example).
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
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set(MOBILE_CLIENT_HEADER, 'mobile');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const base = apiBaseUrl();
  try {
    return await fetch(`${base}${path}`, { ...init, headers });
  } catch {
    throw new NetworkError(base);
  }
}

// Concurrent 401s share one refresh request.
let refreshInFlight: Promise<AuthResult | null> | null = null;

/**
 * Swap the stored refresh token for a new session. Returns null when there is
 * no valid session (the stored token is then removed). Throws NetworkError
 * when the API cannot be reached, leaving the stored token in place.
 */
export function refreshSession(): Promise<AuthResult | null> {
  refreshInFlight ??= (async () => {
    try {
      const refreshToken = await readRefreshToken();
      if (!refreshToken) return null;
      const res = await rawRequest('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        await forgetSession();
        return null;
      }
      const result = await parse<AuthResult>(res);
      await acceptSession(result);
      return result;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** Call the API, refreshing an expired access token once. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await rawRequest(path, init);
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const refreshed = await refreshSession();
    if (!refreshed) onSessionExpired?.();
    else res = await rawRequest(path, init);
  }
  return parse<T>(res);
}

/** JSON request helper for mutations. */
export function send<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) {
  return api<T>(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

/** Sign out on the server (best effort) and forget the session on the device. */
export async function signOut(): Promise<void> {
  const refreshToken = await readRefreshToken();
  try {
    if (refreshToken) await send('POST', '/auth/logout', { refreshToken });
  } catch {
    // Signing out locally still matters when the API is unreachable.
  } finally {
    await forgetSession();
  }
}

/** Field errors from a VALIDATION_ERROR response, keyed by field name. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  const fields = error.details?.fields;
  return fields && typeof fields === 'object' ? (fields as Record<string, string>) : {};
}

/** A message a person can act on, for any error a request can throw. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof NetworkError) return error.message;
  return 'Something went wrong. Please try again.';
}

/** Build a query string, skipping empty values. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.length ? `?${parts.join('&')}` : '';
}
