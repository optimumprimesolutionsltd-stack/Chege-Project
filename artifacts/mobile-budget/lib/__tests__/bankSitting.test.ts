import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getProjectedBalanceAfterPosting } from '../bankBalance';

const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');

// A day's banking is several postings, not one. Recording them meant reopening
// the sheet for each line, re-choosing the type, the date and the account every
// time, and never seeing the balance move until the sheet closed — so the
// closing figure on the statement could not be worked towards.
describe('a sitting records a whole day', () => {
  it('offers to save and stay open, except when editing', () => {
    // An edit is one posting by definition; a second button there would only
    // invite a duplicate.
    expect(bank).toContain('testID="bank-submit-and-add-another"');
    expect(bank).toContain('onPress={() => handleSubmit({ keepOpen: true })}');
    expect(bank).toContain('{editingTransactionId === null ? (');
  });

  it('routes every branch of the submit handler through one ending', () => {
    // Savings transfer, bank-to-bank, deposit, withdrawal and charge each used
    // to close the sheet themselves. A path that kept its own close would drop
    // out of a sitting without saying why.
    expect(bank).toContain("const finishEntry = (keepOpen: boolean, recorded: { amount: number; direction: 'in' | 'out' }) => {");
    const handler = bank.slice(bank.indexOf('const handleSubmit = async ('), bank.indexOf('const transactions: Tx[] ='));
    expect(handler).not.toContain('setModalVisible(false)');
    // Savings transfer, bank-to-bank, the savings destination of a withdrawal,
    // and the shared deposit/withdrawal/charge path.
    expect((handler.match(/finishEntry\(keepOpen/g) ?? []).length).toBe(4);
  });

  it('keeps what a sitting has in common and clears what it does not', () => {
    // The type, the date, the account and the people stay; the amount, the
    // narration, the category and the destination go.
    const reset = bank.slice(bank.indexOf('const resetForNextEntry = () => {'), bank.indexOf('const finishEntry ='));
    expect(reset).toContain("setAmount('');");
    expect(reset).toContain("setExpenseCategory('');");
    expect(reset).toContain('setWithdrawDest(null);');
    expect(reset).not.toContain('setDate(');
    expect(reset).not.toContain('setTxType(');
    expect(reset).not.toContain('setSelectedAccountId(');
  });

  it('counts what the sitting has recorded, both ways', () => {
    expect(bank).toContain('testID="bank-sitting-tally"');
    expect(bank).toContain("recorded.direction === 'in' ? recorded.amount : 0");
    expect(bank).toContain("recorded.direction === 'out' ? recorded.amount : 0");
  });

  it('forgets the sitting when the sheet closes', () => {
    const close = bank.slice(bank.indexOf('const closeModal = () => {'), bank.indexOf('const resetForNextEntry'));
    expect(close).toContain('setSitting(null);');
  });

  it('stops confirming a bank transfer after every line', () => {
    // Worth an interruption once; not eight times in a row.
    expect(bank).toContain("if (!keepOpen) Alert.alert('Bank transfer recorded'");
  });
});

// The balance only moved once the sheet closed and the list refetched, so
// there was no way to watch it fall towards the figure on the statement.
describe('the balance moves as you type', () => {
  it('projects an incoming posting as well as an outgoing one', () => {
    expect(getProjectedBalanceAfterPosting(25000, 5000, 'out')).toBe(20000);
    expect(getProjectedBalanceAfterPosting(25000, 5000, 'in')).toBe(30000);
  });

  it('takes an edited posting back out before applying the new amount', () => {
    // Otherwise editing a 2,000 withdrawal to 3,000 would project a 5,000 fall.
    expect(getProjectedBalanceAfterPosting(23000, 3000, 'out', { amount: 2000, type: 'disbursement' })).toBe(22000);
    expect(getProjectedBalanceAfterPosting(27000, 3000, 'in', { amount: 2000, type: 'deposit' })).toBe(28000);
  });

  it('shows the figure while the amount is still being typed', () => {
    expect(bank).toContain('testID="bank-projected-balance"');
    expect(bank).toContain('After this posting');
  });

  it('shows it for a charge or a transfer too, which have no account card', () => {
    expect(bank).toContain('testID="bank-projected-balance-compact"');
    expect(bank).toContain('{projectedBalance !== null && !(isDeposit || isWithdrawal) ? (');
  });

  it('still warns about an overdraft only when money is leaving', () => {
    // A deposit into an overdrawn account also projects below zero, and "this
    // will take the account below zero" would be a lie about a posting that
    // moves it upward.
    expect(bank).toContain('{isOutgoingTransaction && projectedBalance !== null && projectedBalance < 0 && (');
  });
});

// "Opening balance 25,000, closing 9,400 — maybe the difference is bank
// charges." Until now that arithmetic happened on paper.
describe('checking the account against the statement', () => {
  it('asks for the statement figure and names the gap', () => {
    expect(bank).toContain('testID="bank-reconcile-action"');
    expect(bank).toContain('testID="bank-statement-balance-input"');
    expect(bank).toContain('Math.round((data.balance - parsedStatementBalance) * 100) / 100');
  });

  it('offers the charge without asserting it', () => {
    // A shortfall is usually a fee on a Kenyan statement. Usually is not
    // always, so the app proposes and the narration stays editable.
    expect(bank).toContain('testID="bank-reconcile-record-charge"');
    expect(bank).toContain('testID="bank-reconcile-narration"');
    expect(bank).toContain('but Jamvi will not decide that for you.');
  });

  it('refuses to call a surplus a charge', () => {
    // Money arriving unrecorded is a deposit somebody made, and it needs to be
    // attributed to them rather than written off.
    expect(bank).toContain('testID="bank-reconcile-over"');
    expect(bank).toContain('testID="bank-reconcile-record-deposit"');
    expect(bank).toContain('A charge would be the wrong answer');
  });

  it('says so plainly when the two agree', () => {
    expect(bank).toContain('testID="bank-reconcile-matched"');
  });

  it('lets an overdrawn statement figure be typed', () => {
    // Jamvi records an overdraft rather than refusing it, so the amount parser
    // — which rejects a minus sign, correctly, for an amount — is the wrong
    // one to read a balance with.
    expect(bank).toContain('const parsedStatementBalance = parseBalanceFigure(statementBalance);');
    expect(bank).toContain(String.raw`if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) return null;`);
  });

  it('says the charge will not touch a budget', () => {
    expect(bank).toContain('A charge is kept out of household spending, so this will not touch any budget.');
  });

  it('defaults the narration rather than saving an empty one', () => {
    expect(bank).toContain("narration: reconcileNarration.trim() || 'Bank charges',");
  });
});

// Three things found by walking the flow before anybody used it on a phone.
describe('the sitting holds up in use', () => {
  it('does not project from a balance that is still being refetched', () => {
    // Each save invalidates the account. For that moment data.balance is the
    // figure from before the posting that just landed, so the next line would
    // appear to fall from the wrong number — the very figure somebody
    // recording a day is watching.
    expect(bank).toContain('const { data, isLoading, isFetching, refetch } = useGetJointAccount(');
    expect(bank).toContain('    !isFetching &&');
  });

  it('lets the charge be dated to the day being reconciled', () => {
    // You reconcile a statement after the fact. A charge stamped today leaves
    // the day it belongs to still not adding up.
    expect(bank).toContain('date: reconcileDate,');
    expect(bank).toContain('testID="bank-reconcile-date"');
  });

  it('defaults that date to the last activity on the account, not to today', () => {
    expect(bank).toContain("setReconcileDate(data?.transactions?.[0]?.date?.slice(0, 10) ?? todayIso());");
  });

  it('offers a way out when a transfer has no goal to land in', () => {
    // The picker opened an empty box: no goals, no message, no way to make
    // one, and a transfer that could not be completed at all.
    expect(bank).toContain('testID="bank-transfer-no-goals"');
    expect(bank).toContain('testID="bank-create-goal-from-transfer"');
    expect(bank).toContain("router.push('/(tabs)/goals')");
  });
});
