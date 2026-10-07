import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthResult, PublicUser } from '@moneylens/types';
import type { LoginInput, RegisterInput } from '@moneylens/validation';
import {
  acceptSession,
  api,
  forgetSession,
  NetworkError,
  refreshSession,
  send,
  setSessionExpiredHandler,
  signOut,
} from '@/lib/api';

/** `unreachable`: a saved session exists but the API could not be reached to restore it. */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'unreachable';

export interface AuthContextValue {
  status: AuthStatus;
  user: PublicUser | null;
  /** Message for the `unreachable` state. */
  problem: string | null;
  retry: () => void;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<PublicUser | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const accept = useCallback(async (result: AuthResult) => {
    await acceptSession(result);
    setUser(result.user);
    setStatus('authenticated');
  }, []);

  const signOutLocally = useCallback(() => {
    setUser(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  // Restore the session from the token in secure storage.
  useEffect(() => {
    let cancelled = false;
    refreshSession()
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setUser(result.user);
          setStatus('authenticated');
        } else {
          setStatus('anonymous');
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setProblem(err instanceof NetworkError ? err.message : 'Could not restore your session.');
        setStatus('unreachable');
      });
    setSessionExpiredHandler(() => {
      void forgetSession();
      signOutLocally();
    });
    return () => {
      cancelled = true;
      setSessionExpiredHandler(null);
    };
  }, [attempt, signOutLocally]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      problem,
      retry: () => {
        setStatus('loading');
        setAttempt((n) => n + 1);
      },
      async login(input) {
        await accept(await send<AuthResult>('POST', '/auth/login', input));
      },
      async register(input) {
        await accept(await send<AuthResult>('POST', '/auth/register', input));
      },
      async logout() {
        await signOut();
        signOutLocally();
      },
      async deleteAccount(password) {
        await api('/auth/account', { method: 'DELETE', body: JSON.stringify({ password }) });
        await forgetSession();
        signOutLocally();
      },
    }),
    [status, user, problem, accept, signOutLocally],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
