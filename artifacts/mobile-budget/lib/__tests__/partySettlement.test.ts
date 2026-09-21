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

  it('is offered before anybody has been recorded', () => {
    // It used to appear only once a party had a balance — and the only place
    // to give somebody a balance was behind that chip. So the destination was
    // unreachable: nothing to list, and no way to make anything to list.
    expect(bank).not.toContain('{owedParties.length > 0 ? (() => {');
  });

  it('lets somebody be added from inside the picker', () => {
    expect(bank).toContain('testID="bank-add-party-form"');
    expect(bank).toContain('testID="bank-new-party-name"');
    expect(bank).toContain('testID="bank-add-party"');
  });

  it('can say it is a bank rather than a person', () => {
    // KCB is a party you owe and never a contributor.
    expect(bank).toContain('testID="bank-new-party-institution"');
    expect(bank).toContain("kind: newPartyIsInstitution ? 'institution' : 'person',");
  });

  it('selects the new party for the payment in hand', () => {
    expect(bank).toContain('setWithdrawPartyId(party.id);');
  });

  it('waits for the list before selecting from it', () => {
    // The picker and the settlement prompt both read it, and somebody created
    // moments ago has to be in it by the time they do.
    const handler = bank.slice(bank.indexOf('const handleCreateParty'), bank.indexOf('setWithdrawPartyId(party.id);'));
    expect(handler).toContain("await queryClient.invalidateQueries({ queryKey: ['parties'] });");
  });

  it('insists on a name, and takes zero owed', () => {
    // Somebody you owe nothing yet is still worth recording before the loan.
    expect(bank).toContain("Alert.alert('Who is it?'");
    expect(bank).toContain("const owed = readAmount(newPartyOwed || '0');");
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

// The deposit side shipped with the same fault the withdrawal side had: the
// picker appeared only once somebody already owed you, and the only place to
// say somebody owed you was inside that picker.
describe("recording that somebody owes you", () => {
  it("offers the question before anybody is recorded", () => {
    expect(bank).toContain("{isDeposit ? (");
    expect(bank).not.toContain("{isDeposit && owingParties.length > 0 ? (");
  });

  it("carries a form for saying who, and how much", () => {
    expect(bank).toContain('testID="bank-add-debtor-form"');
    expect(bank).toContain('testID="bank-new-debtor-name"');
    expect(bank).toContain('testID="bank-add-debtor"');
  });

  it("writes the balance the other way round", () => {
    // One creator, two directions: which way it stands between you is the only
    // difference between somebody you owe and somebody who owes you.
    expect(bank).toContain("...(owing ? { owedToUs: toMoney(owed) } : { owedByUs: toMoney(owed) }),");
    expect(bank).toContain("onPress={() => handleCreateParty({ owing: true })}");
  });

  it("selects them for the deposit in hand, not the withdrawal", () => {
    expect(bank).toContain("if (owing) setRepayingPartyId(party.id);");
    expect(bank).toContain("else setWithdrawPartyId(party.id);");
  });

  it("does not read the press event as options", () => {
    // onPress hands the handler a synthetic event, which would arrive as
    // { owing } and quietly write the balance the wrong way round.
    expect(bank).toContain("onPress={() => handleCreateParty()}");
  });
});
