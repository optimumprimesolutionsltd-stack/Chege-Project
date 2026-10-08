import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');

// Paying Mwangi what you owe him, or KCB for a loan, is a withdrawal from a
// tracked account to a party — and until now there was nowhere to say who it
// went to, so the balance had to be corrected by hand afterwards.
describe('paying somebody you owe', () => {
  it('offers the party as a destination', () => {
    expect(bank).toContain('testID="bank-withdraw-dest-party"');
    expect(bank).toContain('A person or business I owe');
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

  it('lists everybody, because a debtor can also be a creditor', () => {
    // These used to be filtered by which way the balance stood, so somebody
    // recorded as owing you could not be paid. The schema has held both
    // columns on one row from the start for exactly this reason.
    expect(bank).toContain('const owedParties = parties;');
    expect(bank).toContain('const owingParties = parties;');
    expect(bank).not.toContain("parties.filter((party) => typeof party.owedByUs === 'number')");
  });

  it('shows what stands between you while choosing', () => {
    // The row now says which way it stands, lending listing the other figure.
    expect(bank).toContain('`owe KES ${formatKES(party.owedByUs ?? 0)}`');
  });

  it('insists on knowing who was paid', () => {
    expect(bank).toContain("Alert.alert('Who are you paying?'");
  });

  it('names them on the posting when nothing else was written', () => {
    // Falls back to what is already on the posting when editing, where the
    // party cannot be restored and replacing it would lose the narration.
    expect(bank).toContain('finalDescription = description.trim() || selectedParty?.name || finalDescription;');
  });

});

// Paying off what you owe is not new spending when the cost was recorded as
// the debt was taken on (stock bought on credit). Asking for a category again
// counted it twice. It is not always so - sometimes the purchase was never
// entered - so a category is optional here, not gone.
describe('paying off a debt needs no category', () => {
  it('does not demand one', () => {
    expect(bank).toContain("withdrawDest !== 'lend' && withdrawDest !== 'party' && !expenseCategory.trim()) {");
  });

  it('says the category is optional, and when to use it', () => {
    expect(bank).toContain('optional — only if this purchase was never recorded');
    expect(bank).toContain('Paying off what you owe is not new spending, so no category is needed.');
    expect(bank).toContain("'None — just paying off the debt'");
  });

  it('can take a chosen category off again', () => {
    expect(bank).toContain('testID="bank-category-clear"');
  });

  it('sends no category on a new payment given none, so it stays out of spending', () => {
    expect(bank).toMatch(/: debtPaymentHasNoCategory\r?\n\s+\? \{\}/);
  });

  it('clears the category on an edit given none', () => {
    expect(bank).toMatch(/: debtPaymentHasNoCategory\r?\n\s+\? \{ expenseCategory: null \}/);
  });

  it('reopens a payment to somebody as one', () => {
    expect(bank).toContain("tx.settlesContributorId ? 'party' : 'other'");
  });

  it('names the payee on an uncategorised payment in the list', () => {
    expect(bank).toContain("`Paid to ${item.debtPartyName}` : 'Debt payment'");
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
    expect(bank).toContain("onPress={() => handleCreateParty(withdrawDest === 'lend' ? { owing: true, forLending: true } : {})}");
  });
});
