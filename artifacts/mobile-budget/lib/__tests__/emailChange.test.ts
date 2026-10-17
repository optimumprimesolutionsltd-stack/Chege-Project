import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { confirmReady, emailChangedMessage, looksLikeEmail } from '../emailChange';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe('changing the sign-in email', () => {
  it('asks for a password only when the account has none, and checks the code shape', () => {
    expect(confirmReady('123456', '', false)).toBe(true);
    expect(confirmReady('123456', 'short', true)).toBe(false);
    expect(confirmReady('123456', 'longenough', true)).toBe(true);
    expect(confirmReady('12345', 'longenough', true)).toBe(false);
  });

  it('accepts only something shaped like an email', () => {
    expect(looksLikeEmail('new@example.com')).toBe(true);
    expect(looksLikeEmail('new@example')).toBe(false);
    expect(looksLikeEmail('not an email')).toBe(false);
  });

  it('says the old address stops working', () => {
    expect(emailChangedMessage('new@example.com')).toContain('old address no longer opens this account');
  });

  it('uses the same rules and wording as the web app', () => {
    const body = (p: string) => read(p).replace(/^ \* The same rules and wording as .*$/m, '');
    expect(body('lib/emailChange.ts')).toBe(body('../family-budget/src/lib/email-change.ts'));
  });

  it('opens from Settings, where it no longer says the email cannot be changed', () => {
    const settings = read('app/(tabs)/settings.tsx');
    expect(settings).toContain('testID="open-change-email"');
    expect(settings).not.toContain('can’t be changed in Jamvi');
    expect(read('app/_layout.tsx')).toContain('<Stack.Screen name="change-email"');
    const screen = read('app/change-email.tsx');
    expect(screen).toContain("'/api/auth/change-email/request-code'");
    expect(screen).toContain("'/api/auth/change-email/confirm'");
    expect(screen).toContain('await adoptUser(result.user)');
  });
});
