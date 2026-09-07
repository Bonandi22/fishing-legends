import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ApiUser } from '@/api/types';
import { setLoggedOutHandler } from '@/api/client';
import * as endpoints from '@/api/endpoints';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: ApiUser | null;
  login(email: string, password: string): Promise<void>;
  register(input: { email: string; password: string; username: string; country: string }): Promise<void>;
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

  const login = useCallback(async (email: string, password: string) => {
    const { user: u } = await endpoints.login({ email, password });
    await enter(u);
  }, [enter]);

  const register = useCallback(async (input: { email: string; password: string; username: string; country: string }) => {
    const { user: u } = await endpoints.register(input);
    await enter(u);
  }, [enter]);

  const logout = useCallback(async () => {
    try { await onBeforeLogoutRef.current?.(); } catch { /* best-effort flush */ }
    try { await endpoints.logout(); } finally { setUser(null); setStatus('anonymous'); }
    onLoggedOutRef.current?.();
  }, []);

  return <AuthContext.Provider value={{ status, user, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
