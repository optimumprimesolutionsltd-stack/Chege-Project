import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// Signed in with another account than the usual one, there was no way back
// out of the new account's setup (5 Oct 2026).
describe('a way out of the wrong account', () => {
  it('signs out, after asking, and goes to the sign-in screen', () => {
    const link = read('components/SwitchAccountLink.tsx');
    expect(link).toContain('Not you? Sign in with another account');
    expect(link).toContain('await logout();');
    expect(link).toContain("router.replace('/login' as never);");
    expect(link).toContain('Nothing is deleted.');
  });

  it('is on the name screen, every setup question and choosing a budget', () => {
    expect(read('app/profile-setup.tsx')).toContain('<SwitchAccountLink color="#9fb3c8" />');
    const chooser = read('app/budget-chooser.tsx');
    expect(chooser.match(/<SwitchAccountLink /g)).toHaveLength(3);
    expect(chooser).toContain('testID="onboarding-switch-account"');
  });
});
