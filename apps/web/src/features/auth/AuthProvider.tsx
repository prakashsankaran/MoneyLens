import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthResult, PublicUser } from '@moneylens/types';
import {
  api,
  refreshSession,
  setAccessToken,
  setSessionExpiredHandler,
} from '../../lib/api-client';

import { AuthContext, type AuthContextValue, type AuthStatus } from './useAuth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<PublicUser | null>(null);

  const accept = useCallback((result: AuthResult) => {
    setAccessToken(result.accessToken);
    setUser(result.user);
    setStatus('authenticated');
  }, []);

  const signOutLocally = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  // Restore the session from the refresh cookie on first load.
  useEffect(() => {
    let cancelled = false;
    void refreshSession().then((result) => {
      if (cancelled) return;
      if (result) accept(result);
      else setStatus('anonymous');
    });
    setSessionExpiredHandler(signOutLocally);
    return () => {
      cancelled = true;
      setSessionExpiredHandler(null);
    };
  }, [accept, signOutLocally]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      async login(input) {
        accept(
          await api<AuthResult>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
        );
      },
      async register(input) {
        accept(
          await api<AuthResult>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
        );
      },
      async logout() {
        try {
          await api('/auth/logout', { method: 'POST' });
        } finally {
          signOutLocally();
        }
      },
      async deleteAccount(password) {
        await api('/auth/account', { method: 'DELETE', body: JSON.stringify({ password }) });
        signOutLocally();
      },
    }),
    [status, user, accept, signOutLocally],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
