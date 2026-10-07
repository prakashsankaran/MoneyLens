import { MOBILE_CLIENT_HEADER } from '@moneylens/types';
import {
  acceptSession,
  api,
  ApiError,
  forgetSession,
  NetworkError,
  qs,
  setSessionExpiredHandler,
  signOut,
} from './api';
import { readRefreshToken, saveRefreshToken } from './token-store';

const ok = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, data }), { status });
const fail = (status: number, code: string, message = 'No') =>
  new Response(JSON.stringify({ success: false, error: { code, message } }), { status });
const session = (n: number) => ({
  user: { id: 'u1', email: 'a@b.c', name: 'A' },
  accessToken: `access-${n}`,
  refreshToken: `refresh-token-${n}-0123456789`,
});

const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();
const headersOf = (call: number) => new Headers(fetchMock.mock.calls[call]![1].headers);
const bodyOf = (call: number) => JSON.parse(String(fetchMock.mock.calls[call]![1].body)) as unknown;

beforeEach(async () => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  setSessionExpiredHandler(null);
  await forgetSession();
});

describe('api client', () => {
  it('identifies itself as the mobile app and sends the access token', async () => {
    await acceptSession(session(1) as never);
    fetchMock.mockResolvedValueOnce(ok({ hello: 'world' }));
    await expect(api('/dashboard')).resolves.toEqual({ hello: 'world' });
    expect(headersOf(0).get(MOBILE_CLIENT_HEADER)).toBe('mobile');
    expect(headersOf(0).get('Authorization')).toBe('Bearer access-1');
  });

  it('keeps the refresh token in secure storage, not the access token', async () => {
    await acceptSession(session(1) as never);
    await expect(readRefreshToken()).resolves.toBe('refresh-token-1-0123456789');
  });

  it('refreshes once on a 401 and retries with the new token', async () => {
    await acceptSession(session(1) as never);
    fetchMock
      .mockResolvedValueOnce(fail(401, 'UNAUTHENTICATED'))
      .mockResolvedValueOnce(ok(session(2)))
      .mockResolvedValueOnce(ok([1, 2]));
    await expect(api('/transactions')).resolves.toEqual([1, 2]);
    expect(fetchMock.mock.calls[1]![0]).toMatch(/\/auth\/refresh$/);
    expect(bodyOf(1)).toEqual({ refreshToken: 'refresh-token-1-0123456789' });
    expect(headersOf(2).get('Authorization')).toBe('Bearer access-2');
    await expect(readRefreshToken()).resolves.toBe('refresh-token-2-0123456789');
  });

  it('shares one refresh between requests that fail together', async () => {
    await acceptSession(session(1) as never);
    fetchMock.mockImplementation(async (url, init) => {
      if (url.endsWith('/auth/refresh')) return ok(session(2));
      const auth = new Headers(init.headers).get('Authorization');
      return auth === 'Bearer access-2' ? ok('fine') : fail(401, 'UNAUTHENTICATED');
    });
    await Promise.all([api('/a'), api('/b'), api('/c')]);
    const refreshes = fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'));
    expect(refreshes).toHaveLength(1);
  });

  it('signs out locally when the refresh token is rejected', async () => {
    await acceptSession(session(1) as never);
    const expired = jest.fn();
    setSessionExpiredHandler(expired);
    fetchMock
      .mockResolvedValueOnce(fail(401, 'UNAUTHENTICATED'))
      .mockResolvedValueOnce(fail(401, 'UNAUTHENTICATED', 'Session expired'));
    await expect(api('/dashboard')).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledTimes(1);
    await expect(readRefreshToken()).resolves.toBeNull();
  });

  it('does not try to refresh for auth endpoints', async () => {
    fetchMock.mockResolvedValueOnce(fail(401, 'UNAUTHENTICATED', 'Wrong email or password'));
    await expect(api('/auth/login', { method: 'POST', body: '{}' })).rejects.toMatchObject({
      status: 401,
      message: 'Wrong email or password',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports an unreachable API in words a person can act on', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(api('/dashboard')).rejects.toBeInstanceOf(NetworkError);
  });

  it('turns a non-JSON error page into a generic error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(api('/dashboard')).rejects.toMatchObject({ status: 502, code: 'INTERNAL_ERROR' });
  });

  it('revokes the refresh token on sign out, and forgets it even offline', async () => {
    await saveRefreshToken('refresh-token-9-0123456789');
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await signOut();
    expect(bodyOf(0)).toEqual({ refreshToken: 'refresh-token-9-0123456789' });
    await expect(readRefreshToken()).resolves.toBeNull();
  });
});

describe('qs', () => {
  it('skips empty values and encodes the rest', () => {
    expect(qs({ q: 'a&b', page: 2, category: '', month: undefined, x: null })).toBe(
      '?q=a%26b&page=2',
    );
    expect(qs({})).toBe('');
  });
});
