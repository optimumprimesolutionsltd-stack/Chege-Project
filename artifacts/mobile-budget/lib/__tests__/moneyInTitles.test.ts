import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const phone = readFileSync('app/(tabs)/bank.tsx', 'utf8');
const web = readFileSync('../family-budget/src/pages/bank.tsx', 'utf8');

// Spending is titled by its category; money in was titled by the bank's text
// ("Received from NCBA Bank") even when it was tagged "Generator income".
describe('money in is titled by its income stream', () => {
  it('uses the stream name when the deposit has one, on both screens', () => {
    expect(phone).toContain('dep && item.incomeSourceId && incomeSourceNames.get(item.incomeSourceId)');
    expect(web).toContain('isDeposit && tx.incomeSourceId && incomeSourceNames.get(tx.incomeSourceId)');
  });
});

// A debt payment already says where the money goes. The row of income streams
// under it meant nothing there, and tapping one quietly undid the debt payment.
describe('paying a debt does not ask where the money is going', () => {
  it('hides that row while paying or lending', () => {
    expect(phone).toContain("{withdrawDest !== 'party' && withdrawDest !== 'lend' ? (<>");
  });
  it('does not assume the creditor is a person', () => {
    expect(phone).not.toContain("'Paying somebody I owe'");
    expect(phone).toContain('A person or business I owe');
  });
});

// The import once filed a whole 75,000 debt payment under the fee category.
describe('a payment filed under the fee category is pointed out', () => {
  it('warns under Category, but not on the fee row itself', () => {
    expect(phone).toContain('testID="bank-category-is-charge-warning"');
    expect(phone).toContain('row.chargeForTransactionId != null);');
  });
});

// Borrowed money was titled by the bank's text ("Received from KCB"), which
// reads like income. It is titled by the lender, as money in is by its stream.
describe('borrowed money is titled by who lent it', () => {
  it('uses the lender on both screens, and says borrowed even when the lender is unknown', () => {
    expect(phone).toContain("dep && item.isBorrowing ? (item.debtPartyName ? `Borrowed from ${item.debtPartyName}` : 'Borrowed money')");
    expect(web).toContain('isDeposit && tx.isBorrowing ? (tx.debtPartyName ? `Borrowed from ${tx.debtPartyName}` : "Borrowed money")');
  });
  it('the phone form records the lender when a borrowing is saved', () => {
    expect(phone).toContain("kind: 'borrowed' }]");
  });
  it('a payment carrying its own fee under that fee category opens with the category cleared', () => {
    expect(phone).toContain("setExpenseCategory(filedAsItsOwnFee ? '' : tx.expenseCategory ?? '');");
    expect(phone).toContain('setShowCategoryPicker(filedAsItsOwnFee);');
  });
});
