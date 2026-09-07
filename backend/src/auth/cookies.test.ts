import { describe, expect, it, vi } from 'vitest';
import {
  setAuthCookies, clearAuthCookies, readAccessToken, readRefreshToken,
  readCsrfCookie, generateCsrfToken, AT_COOKIE, RT_COOKIE, CSRF_COOKIE, type CookieConfig,
} from './cookies.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

const cfg: CookieConfig = { secure: true, accessTtlSeconds: 900, refreshTtlSeconds: 2_592_000 };

function fakeReply() {
  const calls: Array<{ name: string; value: string; opts: Record<string, unknown> }> = [];
  const reply = {
    setCookie: (name: string, value: string, opts: Record<string, unknown>) => { calls.push({ name, value, opts }); return reply; },
    clearCookie: (name: string, opts: Record<string, unknown>) => { calls.push({ name, value: '', opts }); return reply; },
  } as unknown as FastifyReply;
  return { reply, calls };
}

describe('cookies', () => {
  it('generateCsrfToken returns a 43-char base64url string each call', () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('setAuthCookies writes dbl_at, dbl_rt and dbl_csrf with the spec attributes', () => {
    const { reply, calls } = fakeReply();
    const csrf = setAuthCookies(reply, { accessToken: 'AT', refreshToken: 'RT' }, cfg);

    const at = calls.find(c => c.name === AT_COOKIE)!;
    expect(at.value).toBe('AT');
    expect(at.opts).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/api', maxAge: 900 });

    const rt = calls.find(c => c.name === RT_COOKIE)!;
    expect(rt.value).toBe('RT');
    expect(rt.opts).toMatchObject({ httpOnly: true, secure: true, sameSite: 'strict', path: '/api/v1/auth', maxAge: 2_592_000 });

    const csrfCookie = calls.find(c => c.name === CSRF_COOKIE)!;
    expect(csrfCookie.value).toBe(csrf);
    expect(csrfCookie.opts).toMatchObject({ httpOnly: false, secure: true, sameSite: 'lax', path: '/' });
  });

  it('adds domain only when set', () => {
    const { reply, calls } = fakeReply();
    setAuthCookies(reply, { accessToken: 'AT', refreshToken: 'RT' }, { ...cfg, domain: 'example.test' });
    expect(calls.every(c => c.opts.domain === 'example.test')).toBe(true);
  });

  it('clearAuthCookies clears all three on their paths', () => {
    const { reply, calls } = fakeReply();
    clearAuthCookies(reply, cfg);
    expect(calls.map(c => c.name).sort()).toEqual([AT_COOKIE, CSRF_COOKIE, RT_COOKIE].sort());
    expect(calls.find(c => c.name === RT_COOKIE)!.opts).toMatchObject({ path: '/api/v1/auth' });
  });

  it('reads tokens from request.cookies', () => {
    const req = { cookies: { [AT_COOKIE]: 'a', [RT_COOKIE]: 'r', [CSRF_COOKIE]: 'c' } } as unknown as FastifyRequest;
    expect(readAccessToken(req)).toBe('a');
    expect(readRefreshToken(req)).toBe('r');
    expect(readCsrfCookie(req)).toBe('c');
    const empty = { cookies: {} } as unknown as FastifyRequest;
    expect(readAccessToken(empty)).toBeNull();
  });
});
