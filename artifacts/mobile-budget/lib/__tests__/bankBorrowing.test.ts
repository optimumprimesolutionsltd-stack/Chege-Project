import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');

// A deposit could be exactly two things: ordinary money in, or somebody paying
// you back. Borrowed money is neither, so it landed in the first — inflating
// income with money that has to be repaid, and recording no debt at all.
describe('a deposit can be money you borrowed', () => {
  it('is a third answer to the same question', () => {
    expect(bank).toContain('What kind of money is this?');
    expect(bank).toContain('testID="bank-borrow-unspecified"');
  });

  it('can name a tracked debt, or a party, or neither', () => {
    expect(bank).toContain('testID={`bank-borrow-debt-${debt.id}`}');
    expect(bank).toContain('testID={`bank-borrow-party-${party.id}`}');
    expect(bank).toContain("{ kind: 'none' }");
  });

  it('offers to borrow from anybody, not only somebody already owed', () => {
    // owedParties is the withdraw side's list. You can borrow from somebody
    // who currently owes you, and from somebody with no balance either way.
    const section = bank.slice(bank.indexOf('BORROWED — NOT INCOME'), bank.indexOf('testID="bank-borrow-unspecified"'));
    expect(section).toContain('{parties.map((party) => (');
    expect(section).not.toContain('owedParties.map');
  });

  it('lists only categories that are tracked debts', () => {
    expect(bank).toContain("typeof row.debtBalance === 'number'");
    expect(bank).toContain('const trackedDebts = useMemo(');
  });
});

describe('borrowed money is not income', () => {
  it('says so on the transaction', () => {
    expect((bank.match(/\.\.\.\(isBorrowing \? \{ isBorrowing: true \} : \{\}\),/g) ?? []).length).toBe(2);
  });

  it('is sent only when true', () => {
    // An edited posting omits the field rather than sending false, so saving
    // an edit cannot quietly turn a loan back into income.
    expect(bank).not.toContain('isBorrowing: isBorrowing');
    expect(bank).not.toContain('isBorrowing: borrowTarget !== null');
  });

  it('asks nobody whose contribution it was', () => {
    // Borrowed money is no more a contribution than a repayment is.
    expect(bank).toContain('{isDeposit && !repayingParty && !isBorrowing && members.length > 0 && (');
  });

  it('tells the person, where they are deciding it', () => {
    expect(bank).toContain('testID="bank-borrowing-note"');
    expect(bank).toContain('a loan is not earnings, and you will pay it back');
  });
});

describe('it cannot be both at once', () => {
  it('clears borrowing when a repayment is chosen', () => {
    expect(bank).toContain('setRepayingPartyId(party.id); setBorrowTarget(null);');
  });

  it('clears the repayment when borrowing is chosen', () => {
    const section = bank.slice(bank.indexOf('BORROWED — NOT INCOME'));
    expect((section.match(/setRepayingPartyId\(null\); setBorrowTarget\(\{/g) ?? []).length).toBe(3);
  });

  it('clears between postings in a sitting', () => {
    // Otherwise the next line in the same sitting is a loan too.
    // Four: both reset paths, and the two options that clear it by choice.
    expect((bank.match(/setBorrowTarget\(null\);/g) ?? []).length).toBe(4);
  });
});

describe('adding it to what you owe', () => {
  it('offers rather than applies, like every other balance change', () => {
    expect(bank).toContain('const offerDebtIncrease = (categoryName: string, amount: number) => {');
    expect(bank).toContain('const offerPartyBorrowing = (party:');
    // Six offers now: repayment, debt reduction, party settlement, the two
    // that add what was borrowed, and the one that adds what was lent.
    expect((bank.match(/\{ text: 'Not now', style: 'cancel' \},/g) ?? []).length).toBe(6);
  });

  it('works on a debt that starts at nothing outstanding', () => {
    // A brand-new loan is the whole point, and offerDebtReduction's owed > 0
    // guard would have thrown it away.
    expect(bank).toContain("Nothing was outstanding. This would make it KES ${formatKES(borrowed)}.");
    expect(bank).toContain('You owed them nothing.');
  });

  it('adds rather than subtracts', () => {
    expect((bank.match(/owed \+ borrowed/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('only on a new deposit, never on an edit', () => {
    // Offering after an edit would add the loan to the balance a second time.
    expect(bank).toContain("const borrowedAgainst = txType === 'deposit' && editingTransactionId === null ? borrowTarget : null;");
  });

  it('asks once, not twice', () => {
    expect(bank).toContain("} else if (borrowedAgainst?.kind === 'debt') {");
    expect(bank).toContain("} else if (borrowedAgainst?.kind === 'party' && borrowedFrom) {");
  });
});

// Shipped without this: the picker listed lenders already recorded, and the
// only inline creator in that dropdown wrote the other direction. Somebody
// borrowing from Mwangi for the first time had nowhere to say so.
describe('naming the lender', () => {
  it('can be done where the borrowing is recorded', () => {
    expect(bank).toContain('testID="bank-add-lender-form"');
    expect(bank).toContain('testID="bank-new-lender-name"');
    expect(bank).toContain('testID="bank-add-lender"');
  });

  it('writes what you owe them, not what they owe you', () => {
    expect(bank).toContain('onPress={() => handleCreateParty({ asLender: true })}');
    expect(bank).toContain('asLender = false');
  });

  it('selects them for the deposit in hand', () => {
    expect(bank).toContain("setBorrowTarget({ kind: 'party', id: party.id });");
  });

  it('does not read the press event as options', () => {
    // onPress hands a synthetic event, which would arrive as the options
    // object and quietly take the wrong branch.
    expect(bank).not.toContain('onPress={handleCreateParty}');
  });

  it('can say it is a bank rather than a person', () => {
    expect(bank).toContain('testID="bank-new-lender-institution"');
  });

  it('takes nothing already owed, this loan being the whole of it', () => {
    expect(bank).toContain('Leave the amount blank if this loan is the whole of it.');
  });
});

// If there is borrowing there has to be lending: the same movement, the other
// way. Money lent leaves the account like any withdrawal, but it is not spent
// — you expect it back — so counting it as spending makes a month of helping
// somebody read as a month of overspending.
describe('lending is the mirror of borrowing', () => {
  it('is offered where the money leaves', () => {
    expect(bank).toContain('testID="bank-withdraw-dest-lend"');
    expect(bank).toContain('Lending it out');
  });

  it('takes no category, because it is not a cost', () => {
    expect(bank).toContain("{ isLending: true }");
    expect(bank).toContain('testID="bank-lending-note"');
    expect(bank).toContain('No category: lending is not spending.');
  });

  it('insists on knowing who it went to', () => {
    expect(bank).toContain("Alert.alert('Who are you lending to?'");
  });

  it('lends to anybody, not only somebody already owed', () => {
    // A first loan is exactly the case where nothing is tracked yet.
    expect(bank).toContain("{(withdrawDest === 'lend' ? parties : owedParties).map((party) => (");
  });

  it('can record somebody new from inside the picker', () => {
    expect(bank).toContain("onPress={() => handleCreateParty(withdrawDest === 'lend' ? { owing: true, forLending: true } : {})}");
    expect(bank).toContain('LENDING TO SOMEBODY NEW? ADD THEM');
  });

  it('adds it to what they owe, offered not applied', () => {
    expect(bank).toContain('const offerLendingIncrease = (party:');
    expect(bank).toContain("body: JSON.stringify({ owedToUs: owed + lent }),");
  });

  it('starts from nothing when nothing is tracked', () => {
    expect(bank).toContain("const owed = typeof party.owedToUs === 'number' ? party.owedToUs : 0;");
    expect(bank).toContain('They owed you nothing.');
  });

  it('offers only on a new posting, never on an edit', () => {
    expect(bank).toContain("const lentTo = txType === 'disbursement' && editingTransactionId === null ? lentToParty : null;");
  });
});

// A deposit can be ordinary money in, a repayment, or borrowing. A withdrawal
// can be ordinary spending, paying somebody you owe, or lending. The same
// three shapes in opposite directions — asked one way with a dropdown and the
// other with chips, they looked like unrelated questions.
describe('both sides ask the same question the same way', () => {
  it('asks it in the same words on the way out', () => {
    expect((bank.match(/What kind of money is this\?/g) ?? []).length).toBe(2);
    expect(bank).toContain('testID="bank-withdraw-kind"');
  });

  it('offers the three answers a withdrawal has', () => {
    expect(bank).toContain('testID="bank-withdraw-kind-ordinary"');
    expect(bank).toContain('testID="bank-withdraw-dest-party"');
    expect(bank).toContain('testID="bank-withdraw-dest-lend"');
  });

  it('groups lending under what it is, as borrowing is', () => {
    expect(bank).toContain('LENT — NOT SPENDING');
    expect(bank).toContain('BORROWED — NOT INCOME');
  });

  it('says what each answer means rather than assuming', () => {
    expect(bank).toContain('Paying down what you owe them. Still spending — the money is gone.');
    expect(bank).toContain('You expect it back, so it takes no category and counts against no budget.');
  });

  it('does not ask the same thing twice on one screen', () => {
    // The chips that used to carry these answers are gone.
    expect(bank).not.toContain('Someone I owe\n');
    expect((bank.match(/testID="bank-withdraw-dest-party"/g) ?? []).length).toBe(1);
    expect((bank.match(/testID="bank-withdraw-dest-lend"/g) ?? []).length).toBe(1);
  });

  it('goes back to ordinary spending without stranding a party', () => {
    expect(bank).toContain("if (withdrawDest === 'party' || withdrawDest === 'lend') setWithdrawDest('other');");
  });
});

describe('neither lending nor borrowing asks for a category', () => {
  it('does not show the picker while lending', () => {
    expect(bank).toContain("{isWithdrawal && withdrawDest !== 'savings' && withdrawDest !== 'lend' && (");
  });

  it('does not demand one either', () => {
    expect(bank).toContain("if (txType === 'disbursement' && withdrawDest !== 'savings' && withdrawDest !== 'lend' && !expenseCategory.trim()) {");
  });

  it('never asks on a deposit at all, which is where borrowing lives', () => {
    // A deposit has no expenseCategory field in the first place.
    expect(bank).not.toContain("txType === 'deposit' && !expenseCategory");
  });
});

// Opening a posting to edit it treated every withdrawal as ordinary spending,
// because openEdit never set the destination. A loan out has no category by
// design, so saving one demanded a category it must never have.
describe('editing a posting keeps what kind it is', () => {
  it('restores the destination from the row', () => {
    expect(bank).toContain("setWithdrawDest(type === 'disbursement' ? (tx.isLending ? 'lend' : 'other') : null);");
  });

  it('sets it exactly once, so nothing later undoes it', () => {
    // The first fix set it early and the original assignment three lines
    // further down reset it, so the bug survived its own fix.
    expect((bank.match(/setWithdrawDest\(type === 'disbursement'/g) ?? []).length).toBe(1);
  });

  it('reopens a repayment as a repayment, not as ordinary money in', () => {
    expect(bank).toContain("setRepayingPartyId(type === 'deposit' ? tx.settlesContributorId ?? null : null);");
    expect(bank).toContain('settlesContributorId?: number | null;');
  });

  it('reopens borrowed money as borrowed', () => {
    expect(bank).toContain("setBorrowTarget(type === 'deposit' && tx.isBorrowing ? { kind: 'none' } : null);");
    expect(bank).toContain('isBorrowing?: boolean | null;');
  });

  it('can tell a loan out from a withdrawal missing its category', () => {
    expect(bank).toContain('isLending?: boolean | null;');
  });

  it('does not carry a party over from whatever was open before', () => {
    // Sliced forward by length: openReconcile is defined earlier in the file,
    // so slicing to it inverts the range and matches nothing.
    const start = bank.indexOf('const openEdit = (tx: Tx) => {');
    expect(bank.slice(start, start + 2000)).toContain('setWithdrawPartyId(null);');
  });
});
