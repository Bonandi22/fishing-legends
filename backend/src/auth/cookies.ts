import { randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

export const AT_COOKIE = 'dbl_at';
export const RT_COOKIE = 'dbl_rt';
export const CSRF_COOKIE = 'dbl_csrf';

const AT_PATH = '/api';
const RT_PATH = '/api/v1/auth';
const CSRF_PATH = '/';

export type CookieConfig = {
  secure: boolean;
  domain?: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
};

export function generateCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

function base(cfg: CookieConfig, path: string) {
  return { secure: cfg.secure, path, ...(cfg.domain ? { domain: cfg.domain } : {}) };
}

export function setAuthCookies(
  reply: FastifyReply,
  tokens: { accessToken: string; refreshToken: string },
  cfg: CookieConfig,
): string {
  const csrf = generateCsrfToken();
  reply.setCookie(AT_COOKIE, tokens.accessToken, {
    ...base(cfg, AT_PATH), httpOnly: true, sameSite: 'lax', maxAge: cfg.accessTtlSeconds,
  });
  reply.setCookie(RT_COOKIE, tokens.refreshToken, {
    ...base(cfg, RT_PATH), httpOnly: true, sameSite: 'strict', maxAge: cfg.refreshTtlSeconds,
  });
  // One-time migration: a dbl_csrf from before the Path=/ change lingers at
  // Path=/api and shadows the new one server-side (cookie.parse first-wins).
  // Clear it on every auth so a pre-fix browser self-heals on its next login.
  // TODO(remove after 2026-10-07): drop once all pre-fix sessions have rotated
  // (~REFRESH_TOKEN_TTL after this fix shipped).
  reply.clearCookie(CSRF_COOKIE, { ...base(cfg, '/api') });
  reply.setCookie(CSRF_COOKIE, csrf, {
    ...base(cfg, CSRF_PATH), httpOnly: false, sameSite: 'lax', maxAge: cfg.refreshTtlSeconds,
  });
  return csrf;
}

export function clearAuthCookies(reply: FastifyReply, cfg: CookieConfig): void {
  reply.clearCookie(AT_COOKIE, base(cfg, AT_PATH));
  reply.clearCookie(RT_COOKIE, base(cfg, RT_PATH));
  reply.clearCookie(CSRF_COOKIE, base(cfg, CSRF_PATH));
  // TODO(remove after 2026-10-07): legacy migration cleanup — a pre-fix
  // dbl_csrf at Path=/api must also be cleared so logout can fully sign out.
  reply.clearCookie(CSRF_COOKIE, { ...base(cfg, '/api') });
}

export function readAccessToken(request: FastifyRequest): string | null {
  return request.cookies?.[AT_COOKIE] ?? null;
}
export function readRefreshToken(request: FastifyRequest): string | null {
  return request.cookies?.[RT_COOKIE] ?? null;
}
export function readCsrfCookie(request: FastifyRequest): string | null {
  return request.cookies?.[CSRF_COOKIE] ?? null;
}
