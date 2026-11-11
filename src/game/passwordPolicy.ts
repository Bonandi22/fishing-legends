// Shared password policy (NIST 800-63B style). Environment-neutral: used by the
// backend (register/reset) and the frontend (live feedback). No DOM, no Node APIs.
import { COMMON_PASSWORDS } from './data/commonPasswords.js';

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export type PasswordIssue =
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'TOO_COMMON'
  | 'CONTAINS_PERSONAL_INFO'
  | 'SAME_AS_CURRENT'; // checked server-side against the hash, never by checkPassword

export interface PasswordContext {
  email?: string;
  username?: string;
}

const MIN_LOCAL_PART = 3;

export function checkPassword(password: string, ctx: PasswordContext): PasswordIssue | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN) return 'TOO_SHORT';
  if (length > PASSWORD_MAX) return 'TOO_LONG';

  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return 'TOO_COMMON';

  const personal: string[] = [];
  const localPart = ctx.email?.split('@')[0]?.trim().toLowerCase();
  if (localPart && localPart.length >= MIN_LOCAL_PART) personal.push(localPart);
  const username = ctx.username?.trim().toLowerCase();
  if (username) personal.push(username);
  if (personal.some((p) => lower.includes(p))) return 'CONTAINS_PERSONAL_INFO';

  return null;
}
