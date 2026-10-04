import { createContext, useContext } from 'react';
import type { PublicUser } from '@moneylens/types';
import type { LoginInput, RegisterInput } from '@moneylens/validation';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: PublicUser | null;
  login(input: LoginInput): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
  /** Permanently delete the account after re-checking the password. */
  deleteAccount(password: string): Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
