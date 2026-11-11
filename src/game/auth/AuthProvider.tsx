import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ApiUser } from '@/api/types';
import { setLoggedOutHandler } from '@/api/client';
import * as endpoints from '@/api/endpoints';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: ApiUser | null;
  /** Step 1 of the 2-step login: the server emails a code and returns its challenge id. */
  login(email: string, password: string, locale: string): Promise<{ challengeId: string }>;
  /** Step 1 of signup: creates the (unverified) account and emails a confirmation code. */
  register(input: endpoints.RegisterInput): Promise<{ challengeId: string }>;
  /** Step 2: exchange the emailed code for a session. */
  completeChallenge(kind: 'register' | 'login', challengeId: string, code: string): Promise<void>;
  /** Re-sends the code; returns the NEW challenge id to use from then on. */
  resendCode(challengeId: string): Promise<string>;
  /** Emails a password-reset code. The answer is the same whether or not the address has an account. */
  forgotPassword(email: string, locale?: string): Promise<{ challengeId: string }>;
  /** Sets the new password with the emailed code. Does NOT authenticate: the user logs in afterwards. */
  resetPassword(challengeId: string, code: string, newPassword: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children, onAuthenticated, onLoggedOut, onBeforeLogout }: { children: ReactNode; onAuthenticated?: () => void | Promise<void>; onLoggedOut?: () => void; onBeforeLogout?: () => void | Promise<void> }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<ApiUser | null>(null);
  const onAuthRef = useRef(onAuthenticated);
  onAuthRef.current = onAuthenticated;
  const onLoggedOutRef = useRef(onLoggedOut);
  onLoggedOutRef.current = onLoggedOut;
  const onBeforeLogoutRef = useRef(onBeforeLogout);
  onBeforeLogoutRef.current = onBeforeLogout;

  const enter = useCallback(async (u: ApiUser) => {
    setUser(u);
    setStatus('authenticated');
    await onAuthRef.current?.();
  }, []);

  useEffect(() => {
    setLoggedOutHandler(() => { setUser(null); setStatus('anonymous'); });
    let alive = true;
    endpoints.getMe()
      .then(({ user: p }) => { if (alive) void enter({ id: p.userId, email: p.email, username: p.username, country: p.country }); })
      .catch(() => { if (alive) { setUser(null); setStatus('anonymous'); } });
    return () => { alive = false; };
  }, [enter]);

  const login = useCallback(
    (email: string, password: string, locale: string) => endpoints.login({ email, password, locale }),
    [],
  );

  const register = useCallback((input: endpoints.RegisterInput) => endpoints.register(input), []);

  const completeChallenge = useCallback(async (kind: 'register' | 'login', challengeId: string, code: string) => {
    const { user: u } = kind === 'register'
      ? await endpoints.verifyEmail({ challengeId, code })
      : await endpoints.verifyLogin({ challengeId, code });
    await enter(u);
  }, [enter]);

  const resendCode = useCallback(async (challengeId: string) => {
    const { challengeId: next } = await endpoints.resendCode({ challengeId });
    return next;
  }, []);

  const forgotPassword = useCallback(
    (email: string, locale?: string) => endpoints.forgotPassword({ email, locale }),
    [],
  );

  const resetPassword = useCallback(
    (challengeId: string, code: string, newPassword: string) => endpoints.resetPassword({ challengeId, code, newPassword }),
    [],
  );

  const logout = useCallback(async () => {
    try { await onBeforeLogoutRef.current?.(); } catch { /* best-effort flush */ }
    try { await endpoints.logout(); } finally { setUser(null); setStatus('anonymous'); }
    onLoggedOutRef.current?.();
  }, []);

  return <AuthContext.Provider value={{ status, user, login, register, completeChallenge, resendCode, forgotPassword, resetPassword, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
