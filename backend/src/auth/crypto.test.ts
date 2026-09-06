// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { hashPassword, needsRehash, verifyPassword } from './crypto.js';

// A hash produced by the previous scrypt scheme (password: "legacy-password").
const LEGACY_SCRYPT = 'scrypt$YQ$5a7d2c1e';

describe('password hashing', () => {
  it('produces an Argon2id PHC string that carries its parameters', async () => {
    const hash = await hashPassword('a-strong-password');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).toContain('m=');
    expect(hash).toContain('t=');
  });

  it('verifies a correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('still verifies a legacy scrypt hash', async () => {
    const legacy = await hashPasswordScrypt('legacy-password');
    expect(await verifyPassword('legacy-password', legacy)).toBe(true);
    expect(await verifyPassword('nope', legacy)).toBe(false);
  });

  it('flags a legacy hash for rehash but not a current one', async () => {
    expect(needsRehash(await hashPasswordScrypt('x'))).toBe(true);
    expect(needsRehash(await hashPassword('x'))).toBe(false);
    expect(needsRehash(LEGACY_SCRYPT)).toBe(true);
  });

  it('returns false for a malformed hash instead of throwing', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
  });
});

// Reproduce the old scheme locally so the legacy path stays covered.
async function hashPasswordScrypt(password: string): Promise<string> {
  const { randomBytes, scrypt } = await import('node:crypto');
  const { promisify } = await import('node:util');
  const salt = randomBytes(16);
  const key = (await promisify(scrypt)(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}
