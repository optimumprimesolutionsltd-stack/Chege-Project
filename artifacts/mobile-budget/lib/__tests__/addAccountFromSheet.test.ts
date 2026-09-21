import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');

// The door to creating an account appeared inside a posting sheet only when
// there were no accounts at all. So the moment you opened your first one, the
// app stopped letting you add a second from the one place you notice it is
// missing — halfway through recording money that went somewhere else.
describe('adding an account without leaving the posting', () => {
  it('offers it whether or not accounts already exist', () => {
    expect(bank).toContain('testID="bank-add-account-from-transaction"');
    expect(bank).toContain('{accounts.length > 0 && canManageAccount ? (');
  });

  it('comes back to the posting afterwards, with the new account chosen', () => {
    // Everything typed is still there: the sheet is hidden, not reset.
    expect(bank).toContain('if (resumeTransactionAfterAccount) {');
    expect(bank).toContain('setModalVisible(true);');
    expect(bank).toContain('selectAccount(account.id);');
  });

  it('comes back when you change your mind too', () => {
    // Backing out used to leave the transaction sheet hidden with everything
    // typed into it still there but unreachable.
    expect(bank).toContain('const closeAccountEditor = () => {');
    expect(bank).toContain('onRequestClose={closeAccountEditor}');
    expect(bank).toContain('testID="bank-cancel-account"');
  });

  it('only resumes when it was opened from a posting', () => {
    // Opened from the header, there is nothing to go back to.
    expect(bank).toContain('const openAccountEditor = (accountId?: number, { resumeTransaction = false } = {}) => {');
    expect(bank).toContain('openAccountEditor(undefined, { resumeTransaction: true });');
  });

  it('refuses to close while the save is in flight', () => {
    expect(bank).toContain('if (savingAccount) return;');
  });
});

// A savings goal had the same shape of problem: the app told you none existed
// and sent you to another tab, which costs you the posting you were entering.
// The moment you notice a goal is missing is the moment you are trying to use
// it.
describe("making a savings goal where it is missed", () => {
  it("offers the form on both doors into savings", () => {
    expect(bank).toContain('testID="bank-inline-goal-form"');
    expect(bank).toContain('testID="bank-withdraw-goal-form"');
  });

  it("no longer sends you to the Goals tab to make one", () => {
    expect(bank).not.toContain("router.push('/(tabs)/goals')");
    expect(bank).not.toContain("No savings goals set up yet");
  });

  it("selects the new goal for the posting in hand", () => {
    expect(bank).toContain("setWithdrawGoalId(goal.id);");
  });

  it("asks for a name and insists on one", () => {
    expect(bank).toContain("Alert.alert('Name the goal'");
  });

  it("lets the target be left out", () => {
    // Setting money aside without a figure in mind is an ordinary thing to do.
    expect(bank).toContain("const target = readAmount(newGoalTarget || '0');");
    expect(bank).toContain("Leave the target blank if you are setting money aside without a figure in mind.");
  });

  it("keeps offering the form once goals exist", () => {
    // The one you want may still not be among them.
    expect(bank).toContain(`{savingsGoals.length === 0 ? 'NO GOALS YET \u2014 MAKE ONE' : "CAN'T FIND IT? ADD A GOAL"}`);
  });
});
