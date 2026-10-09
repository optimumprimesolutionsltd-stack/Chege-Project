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
    // Only the month on screen since 9 Oct 2026 (docs/account-list-paging.md).
    expect(history).toContain('const { data: bankAccount } = useGetJointAccount(bankMonthParams, { query: { queryKey: getGetJointAccountQueryKey(bankMonthParams), subscribed: onScreen } });');
    expect(history).toContain('const bankSpending = useMemo(');
  });

  it('merges them into one list', () => {
    expect(history).toContain('() => [...(handEntered as Expense[]), ...(bankSpending as unknown as Expense[])]');
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

  it('removes one from its account, by an owner or admin, but never a debt entry', () => {
    // "Edit button does not work" (8 Oct 2026): with a year imported nearly every row was
    // a bank posting, and Edit offered only padlocks. Debt entries stay on Banking, which
    // offers to put the person's balance back.
    expect(history).toContain('if (posting.fromBankPosting) return isContributionManager && !posting.isDebtPosting;');
    expect(history).toContain('if (id < 0) await deleteTransaction.mutateAsync({ id: -id });');
    expect(history).toContain('testID={`history-locked-${row.item.id}`}');
  });

  it('cannot collide with an expense id', () => {
    // The editor stages removals by id, and both tables count from one.
    expect(history).toContain('id: -row.id,');
  });

  it('says where the row came from, so a locked row is not a mystery', () => {
    expect(history).toContain("' · from Banking'");
  });
});
