import { describe, expect, it } from 'vitest';
import { checkPassword } from '../../../src/game/passwordPolicy.js';

describe('shared password policy (backend import smoke)', () => {
  it('is importable and callable from backend code', () => {
    expect(checkPassword('short', {})).toBe('TOO_SHORT');
    expect(checkPassword('correct horse battery staple', {})).toBeNull();
  });
});
