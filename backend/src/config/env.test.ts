// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { loadConfig, parseTrustProxy } from './env.js';

describe('parseTrustProxy', () => {
  it('defaults to not trusting any proxy', () => {
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('FALSE')).toBe(false);
  });

  it('accepts an explicit boolean true', () => {
    expect(parseTrustProxy('true')).toBe(true);
  });

  it('accepts a comma-separated list of trusted addresses/subnets', () => {
    expect(parseTrustProxy('10.0.0.0/8, 192.168.0.0/16')).toEqual(['10.0.0.0/8', '192.168.0.0/16']);
  });
});

const base = {
  ACCESS_TOKEN_SECRET: 'x'.repeat(32),
};

describe('loadConfig cookie settings', () => {
  it('defaults cookieSecure to true and leaves cookieDomain undefined', () => {
    const config = loadConfig({ ...base } as NodeJS.ProcessEnv);
    expect(config.cookieSecure).toBe(true);
    expect(config.cookieDomain).toBeUndefined();
  });

  it('reads COOKIE_SECURE=false and COOKIE_DOMAIN', () => {
    const config = loadConfig({ ...base, COOKIE_SECURE: 'false', COOKIE_DOMAIN: 'example.test' } as NodeJS.ProcessEnv);
    expect(config.cookieSecure).toBe(false);
    expect(config.cookieDomain).toBe('example.test');
  });
});
