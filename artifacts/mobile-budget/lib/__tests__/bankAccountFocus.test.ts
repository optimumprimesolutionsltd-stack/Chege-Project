import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');

// Every account stayed on screen after one was chosen. On a phone that pushes
// the amount and the balance below the fold, and the eye keeps returning to
// accounts this posting has nothing to do with.
describe('choosing an account puts the others away', () => {
  it('shows only the chosen one once it is chosen', () => {
    expect(bank).toContain('accounts.filter((accountOption) => accountOption.id === selectedAccountId)');
    expect(bank).toContain('const [changingAccount, setChangingAccount] = useState(false);');
  });

  it('keeps a way back to the rest', () => {
    // Put away, not taken away.
    expect(bank).toContain('testID="bank-change-account"');
    expect(bank).toContain('Use a different account');
  });

  it('offers that way back only when there is another to go to', () => {
    expect(bank).toContain('{selectedAccountId && !changingAccount && accounts.length > 1 ? (');
  });

  it('reopens the whole list when it is asked for', () => {
    expect(bank).toContain('onPress={() => setChangingAccount(true)}');
    expect(bank).toContain('setChangingAccount(false);');
  });

  it('leaves adding an account where it always is', () => {
    // It used to appear only when there were no accounts at all, which was
    // fixed on purpose. Putting it behind the collapsed list would undo that.
    expect(bank).toContain('{accounts.length > 0 && canManageAccount ? (');
  });
});

describe('the balance is visible while typing', () => {
  it('sits directly under the account, not below a list of the others', () => {
    // This is what makes the running balance actually visible on a phone:
    // with one account on screen instead of five, the balance and the amount
    // are above the fold together.
    expect(bank).toContain('testID="bank-transaction-account-balance"');
  });

  it('still shows the account balance and what the posting leaves', () => {
    expect(bank).toContain('testID="bank-transaction-account-balance"');
    expect(bank).toContain('testID="bank-projected-balance"');
    expect(bank).toContain('The balance moves as you type, so you can work down to the figure on your statement.');
  });
});
