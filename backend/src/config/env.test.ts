// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { parseTrustProxy } from './env.js';

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
