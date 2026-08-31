import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './auth';

describe('local password authentication', () => {
  it('hashes and verifies a password without storing the plaintext', () => {
    const password = 'correct horse battery staple';
    const hash = hashPassword(password);
    expect(hash).not.toContain(password);
    expect(verifyPassword(password, hash)).toBe(true);
    expect(verifyPassword('wrong password', hash)).toBe(false);
  });

  it('rejects malformed password hashes', () => {
    expect(verifyPassword('anything', 'not-a-valid-hash')).toBe(false);
  });
});
