import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const phone = readFileSync('app/(tabs)/bank.tsx', 'utf8');
const web = readFileSync('../family-budget/src/pages/bank.tsx', 'utf8');

// The group's list of income streams holds everybody's. A stream showed there
// and not under the member expected to own it, with nothing to say whose it was.
describe("The group's income streams say whose they are", () => {
  it('names the owner, or says the owner is not a current member, on both screens', () => {
    expect(phone).toContain("{!singleDepositorId ? ` · ${sourceOwnerLabel(src.userId)}` : ''}");
    expect(phone).toContain("'not a current member'");
    expect(web).toContain('?? "not a current member"');
  });

  it('explains what The group is for', () => {
    expect(phone).toContain('testID="bank-deposit-group-note"');
    expect(web).not.toContain('the The group');
    for (const screen of [phone, web]) expect(screen).toContain("count towards anybody");
  });
});
