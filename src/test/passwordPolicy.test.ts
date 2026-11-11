import { describe, expect, it } from 'vitest';
import { checkPassword, PASSWORD_MAX, PASSWORD_MIN } from '../game/passwordPolicy';

describe('passwordPolicy', () => {
  it('exposes the length bounds', () => {
    expect(PASSWORD_MIN).toBe(12);
    expect(PASSWORD_MAX).toBe(128);
  });
  it('rejects short passwords', () => {
    expect(checkPassword('short', {})).toBe('TOO_SHORT');
  });
  it('rejects overly long passwords', () => {
    expect(checkPassword('a'.repeat(129), {})).toBe('TOO_LONG');
    expect(checkPassword('Zq9-'.repeat(32), {})).toBeNull();
  });
  it('rejects common passwords case-insensitively', () => {
    expect(checkPassword('Password1234', {})).toBe('TOO_COMMON');
  });
  it('rejects the username, case-insensitively', () => {
    expect(checkPassword('xx-myangler-2026', { username: 'MyAngler' })).toBe('CONTAINS_PERSONAL_INFO');
  });
  it('rejects the email local-part, case-insensitively', () => {
    expect(checkPassword('JOAO.SILVA-2026!', { email: 'joao.silva@x.pt' })).toBe('CONTAINS_PERSONAL_INFO');
  });
  it('ignores local-parts shorter than 3 chars', () => {
    expect(checkPassword('abacate-azul-grande', { email: 'ab@x.pt' })).toBeNull();
  });
  it('accepts a passphrase', () => {
    expect(checkPassword('correct horse battery staple', {})).toBeNull();
  });
});
