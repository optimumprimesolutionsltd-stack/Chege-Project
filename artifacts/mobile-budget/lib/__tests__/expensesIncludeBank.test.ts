import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const history = readFileSync('app/(tabs)/history.tsx', 'utf8');

// A withdrawal with a category is spending by every figure in the app — the
// category breakdown counts it, the budget measures against it — but it lives
// in joint_account_transactions, and this list read only the expenses table.
// So a tab called Expenses said "No expenses yet" to somebody who had spent
// all month through the bank.
describe('the Expenses tab shows spending that went through a bank account', () => {
  it('reads the account as well as the expenses table', () => {
    expect(history).toContain('const { data: bankAccount } = useGetJointAccount();');
    expect(history).toContain('const bankSpending = useMemo(');
  });

  it('merges them into one list', () => {
    expect(history).toContain('() => [...(handEntered as Expense[]), ...(bankSpending as unknown as Expense[])],');
  });

  it('takes only what is spending', () => {
    expect(history).toContain("row.type === 'disbursement'");
    expect(history).toContain('!row.bankTransferId');
    expect(history).toContain("typeof row.expenseCategory === 'string'");
  });

  it('never counts an expense twice', () => {
    // A bank posting linked to an expense is already in the other list.
    expect(history).toContain('!row.expenseId');
  });

  it('shows only the month being looked at', () => {
    expect(history).toContain('Number(row.date.slice(0, 4)) === year');
    expect(history).toContain('Number(row.date.slice(5, 7)) === month');
  });
});

describe('but they cannot be edited or removed there', () => {
  it('refuses editing', () => {
    // Never spanning a line: these files are CRLF on disk.
    expect(history).toContain('// A bank posting is corrected where the balance follows it, not here.');
  });

  it('refuses removal', () => {
    expect((history.match(/fromBankPosting\) return false;/g) ?? []).length).toBe(2);
  });

  it('cannot collide with an expense id', () => {
    // The editor stages removals by id, and both tables count from one.
    expect(history).toContain('id: -row.id,');
  });

  it('says where the row came from, so a locked row is not a mystery', () => {
    expect(history).toContain("' · from Banking'");
  });
});
