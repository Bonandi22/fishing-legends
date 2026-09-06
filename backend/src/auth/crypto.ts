import { createHash, randomBytes, randomUUID, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';

const scrypt = promisify(nodeScrypt);

/** Hash a password with Argon2id. The returned PHC string carries its own parameters. */
export async function hashPassword(password: string): Promise<string> {
  return argon2Hash(password); // @node-rs/argon2 defaults: argon2id, m=19456, t=2, p=1
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (encoded.startsWith('$argon2')) {
    try {
      return await argon2Verify(encoded, password);
    } catch {
      return false;
    }
  }
  if (encoded.startsWith('scrypt$')) return verifyScrypt(password, encoded);
  return false;
}

/** True when a stored hash is not the current scheme and should be re-hashed on next login. */
export function needsRehash(encoded: string): boolean {
  return !encoded.startsWith('$argon2id$');
}

async function verifyScrypt(password: string, encoded: string): Promise<boolean> {
  const [, saltValue, keyValue] = encoded.split('$');
  if (!saltValue || !keyValue) return false;
  const expected = Buffer.from(keyValue, 'base64url');
  const actual = (await scrypt(password, Buffer.from(saltValue, 'base64url'), expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createOpaqueToken(): string {
  return `${randomUUID()}${randomBytes(24).toString('base64url')}`;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
