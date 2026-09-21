import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');

// Paying Mwangi what you owe him, or KCB for a loan, is a withdrawal from a
// tracked account to a party — and until now there was nowhere to say who it
// went to, so the balance had to be corrected by hand afterwards.
describe('paying somebody you owe', () => {
  it('offers the party as a destination', () => {
    expect(bank).toContain('testID="bank-withdraw-dest-party"');
    expect(bank).toContain('Someone I owe');
  });

  it('stays out of the way of a household that owes nobody', () => {
    // Nothing recorded, nothing offered.
    expect(bank).toContain('{owedParties.length > 0 ? (() => {');
  });

  it('lists only parties there is something to settle with', () => {
    expect(bank).toContain("() => parties.filter((party) => typeof party.owedByUs === 'number'),");
  });

  it('shows what stands between you while choosing', () => {
    expect(bank).toContain('owe KES {formatKES(party.owedByUs ?? 0)}');
  });

  it('insists on knowing who was paid', () => {
    expect(bank).toContain("Alert.alert('Who are you paying?'");
  });

  it('names them on the posting when nothing else was written', () => {
    expect(bank).toContain('finalDescription = description.trim() || selectedParty.name;');
  });

  it('still asks what kind of cost it was', () => {
    // The money did leave, so it is spending and belongs to a category. The
    // books-correct reading — principal is a balance-sheet movement, only
    // interest is a cost — is a later question, and a bigger one.
    expect(bank).toContain('The category below says what kind of cost this was.');
  });
});

describe('settling the balance afterwards', () => {
  it('offers rather than applies', () => {
    expect(bank).toContain('const offerPartySettlement = (party:');
    expect(bank).toContain("{ text: 'Not now', style: 'cancel' },");
  });

  it('writes the remaining balance, never below zero', () => {
    expect(bank).toContain('const remaining = Math.max(0, owed - paid);');
    expect(bank).toContain("body: JSON.stringify({ owedByUs: remaining }),");
  });

  it('says when the payment settles it outright', () => {
    expect(bank).toContain('This settles it.');
  });

  it('asks once, not twice, when the category is also a tracked debt', () => {
    // Who was paid outranks what it was spent on; two prompts for one payment
    // would invite taking the money off twice.
    expect(bank).toContain('if (wasNewWithdrawal && paidParty) {');
    expect(bank).toContain('} else if (wasNewWithdrawal && paidCategory) {');
  });

  it('reads who was paid before finishEntry clears the form', () => {
    const handler = bank.slice(bank.indexOf('const wasNewWithdrawal'), bank.indexOf('offerPartySettlement(paidParty'));
    expect(handler).toContain("const paidParty = withdrawDest === 'party' ? selectedParty : null;");
    expect(handler).toContain('finishEntry(keepOpen');
  });

  it('clears the party between postings in a sitting', () => {
    // Otherwise the next line in the same sitting would settle the same
    // balance again.
    expect(bank).toContain('setWithdrawPartyId(null);');
  });
});
