// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { FISHING_SESSION_TTL_MS, isSessionExpired, sessionExpiresAt } from './session.js';

describe('fishing session expiry', () => {
  const created = new Date('2026-09-06T12:00:00.000Z');

  it('is not expired within the TTL', () => {
    expect(isSessionExpired(created, new Date(created.getTime() + FISHING_SESSION_TTL_MS - 1))).toBe(false);
  });

  it('is expired past the TTL', () => {
    expect(isSessionExpired(created, new Date(created.getTime() + FISHING_SESSION_TTL_MS + 1))).toBe(true);
  });

  it('exposes the deadline', () => {
    expect(sessionExpiresAt(created).toISOString()).toBe('2026-09-06T12:05:00.000Z');
  });
});
