import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
const card = readFileSync('components/DebtPayoffCard.tsx', 'utf8');

// Paying a creditor counted as spending and left what you owe untouched, so
// the Debt tab drifted away from reality one payment at a time.
describe('paying a debt from the bank', () => {
  it('offers to take the payment off what is owed', () => {
    expect(bank).toContain('const offerDebtReduction = (categoryName: string, amount: number) => {');
    expect(bank).toContain('offerDebtReduction(paidCategory, parsed);');
  });

  it('asks rather than applying it', () => {
    // A balance is stored and a posting can be edited or deleted afterwards.
    // If paying reduced it by itself, every one of those paths would have to
    // put it back, and the first that did not would send the balance wrong.
    expect(bank).toContain("{ text: 'Not now', style: 'cancel' },");
    expect(bank).toContain('stays a number you own.');
  });

  it('only asks on a new withdrawal, and reads that before it is cleared', () => {
    // finishEntry clears editingTransactionId, so a check after it would think
    // every save was a new one — and an edit would take the money off twice.
    expect(bank).toContain("const wasNewWithdrawal = txType === 'disbursement' && editingTransactionId === null;");
    const handler = bank.slice(bank.indexOf('const wasNewWithdrawal'), bank.indexOf('offerDebtReduction(paidCategory'));
    expect(handler).toContain('finishEntry(keepOpen');
  });

  it('stays quiet unless the category is actually a debt', () => {
    expect(bank).toContain("typeof row.debtBalance === 'number'");
    expect(bank).toContain('if (!debt || typeof owed !== \'number\' || owed <= 0 || amount <= 0) return;');
  });

  it('never drives the balance below zero, and says when it clears', () => {
    expect(bank).toContain('const remaining = Math.max(0, owed - paid);');
    expect(bank).toContain('This clears it.');
  });

  it('keeps the cents, as the column now holds', () => {
    // It used to round to whole shillings, so paying 1,250.75 off a loan moved
    // the balance by 1,251 and the debt drifted every time it was touched.
    // 0041 widened the column; toMoney rounds to the cent rather than past it.
    expect(bank).toContain('const paid = toMoney(amount);');
    expect(bank).not.toContain('const paid = Math.round(amount);');
  });
});

// I told the user debts could only be managed on a laptop, and shipped that
// into the guide. The editor had been on the phone all along, in a component
// the Debt tab renders.
describe('the phone can manage a debt', () => {
  it('can start tracking one', () => {
    expect(card).toContain('testID="debt-add-open"');
    expect(card).toContain('testID="debt-new-name-input"');
    expect(card).toContain('testID="debt-new-balance-input"');
  });

  it('can change the balance and the rate', () => {
    expect(card).toContain('testID={`debt-edit-${debt.id}`}');
    expect(card).toContain('testID={`debt-balance-input-${debt.id}`}');
    expect(card).toContain('testID={`debt-rate-input-${debt.id}`}');
  });

  it('can stop tracking without losing the category', () => {
    expect(card).toContain('testID={`debt-stop-tracking-${debt.id}`}');
    expect(card).toContain('debtBalance: null, debtInterestRateBps: null');
  });
});

// Adding a creditor from the withdraw sheet produced an ordinary category, so
// saying what was owed still meant a trip to the Debt tab — which costs the
// payment being entered, the same fault as the account and the goal.
describe("making a creditor where it is paid", () => {
  it("offers to track the new category as money owed", () => {
    expect(bank).toContain('testID="bank-new-category-is-debt"');
    expect(bank).toContain("This is money I owe");
    expect(bank).toContain('testID="bank-new-category-owed"');
  });

  it("sends the balance and the rate with the category", () => {
    expect(bank).toContain("debtBalance: toMoney(owed ?? 0),");
    // Basis points, so the rate is an exact integer rather than a float that
    // drifts on repeated writes.
    expect(bank).toContain("debtInterestRateBps: ratePercent ? Math.round(Number(ratePercent) * 100) : null,");
  });

  it("takes the rate as a percentage and refuses nonsense", () => {
    expect(bank).toContain("Give the yearly rate as a percentage, such as 14 or 7.5.");
  });

  it("leaves an ordinary category alone", () => {
    // The debt columns are sent only when the box is ticked; everything else
    // added here is still a plain category.
    expect(bank).toContain("...(newCategoryIsDebt");
  });

  it("clears the debt fields after adding, like the rest of the form", () => {
    expect(bank).toContain("setNewCategoryIsDebt(false);");
    expect(bank).toContain("setNewCategoryOwed('');");
  });

  it("waits for the category list before the withdrawal can be saved against it", () => {
    // The reduce prompt reads that list after the withdrawal saves. Fired and
    // forgotten, a debt created seconds earlier might not be in it yet, and
    // the offer would simply not appear.
    expect(bank).toContain("await queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });");
  });
});

// A debt read as an ordinary category in the picker, so the reduce prompt
// afterwards arrived from nowhere.
describe("the picker says which categories are debts", () => {
  it("shows what is owed beside the name", () => {
    expect(bank).toContain('testID={`withdraw-owed-${child}`}');
    expect(bank).toContain('testID={`withdraw-owed-${group.name}`}');
    expect(bank).toContain("owe KES {formatKES(owedOn(child))}");
  });

  it("says nothing for a category that is not a debt, or one already cleared", () => {
    expect(bank).toContain("typeof row.debtBalance === 'number' && row.debtBalance > 0");
    expect(bank).toContain("owedOn(child) !== null ? (");
  });

  it("builds the lookup once per category list, not per row", () => {
    expect(bank).toContain("const owedByCategory = useMemo(() => {");
    expect(bank).toContain("}, [categories]);");
  });
});
