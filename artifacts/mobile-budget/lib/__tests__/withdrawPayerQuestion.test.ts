import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const phone = readFileSync('app/(tabs)/bank.tsx', 'utf8');
const web = readFileSync('../family-budget/src/pages/bank.tsx', 'utf8');

// "Who is withdrawing?" offered "The group" in a Personal budget, and even in a
// Shared group nobody could tell that "The group" meant the shared account.
describe('Who is withdrawing?', () => {
  it('is only asked in a Shared group', () => {
    expect(phone).toContain('{isWithdrawal && isSharedWorkspace && members.length > 0 && (');
    expect(web).toContain('{isSharedWorkspace && <div className="space-y-2 sm:col-span-2">');
  });

  it("names the shared account instead of saying The group", () => {
    expect(phone).toContain("{selectedAccount?.name ?? 'The shared account'}");
    expect(web).toContain('{account?.accountName ?? "The shared account"}');
    for (const screen of [phone, web]) {
      const chip = screen.slice(screen.indexOf('Who is withdrawing?'), screen.indexOf('Named member chips'));
      expect(chip).not.toContain('The group');
    }
  });
});
