import { randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

export const AT_COOKIE = 'dbl_at';
export const RT_COOKIE = 'dbl_rt';
export const CSRF_COOKIE = 'dbl_csrf';

const AT_PATH = '/api';
const RT_PATH = '/api/v1/auth';
const CSRF_PATH = '/api';

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
  reply.setCookie(CSRF_COOKIE, csrf, {
    ...base(cfg, CSRF_PATH), httpOnly: false, sameSite: 'lax', maxAge: cfg.refreshTtlSeconds,
  });
  return csrf;
}

export function clearAuthCookies(reply: FastifyReply, cfg: CookieConfig): void {
  reply.clearCookie(AT_COOKIE, base(cfg, AT_PATH));
  reply.clearCookie(RT_COOKIE, base(cfg, RT_PATH));
  reply.clearCookie(CSRF_COOKIE, base(cfg, CSRF_PATH));
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
