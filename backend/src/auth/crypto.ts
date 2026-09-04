import { createHash, randomBytes, randomUUID, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(nodeScrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, saltValue, keyValue] = encoded.split('$');
  if (algorithm !== 'scrypt' || !saltValue || !keyValue) return false;

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
