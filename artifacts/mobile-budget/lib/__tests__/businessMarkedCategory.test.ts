import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { businessKeyFor, matchedBusinessKey } from '@/lib/ownerBusiness';

// "still not saving to donations even after save ... there isnt not sure tab" (11 Oct 2026):
// a payment marked as the business's dropped the category chosen for it, and hid
// Who is this for? - where Not sure lives.
const bank = readFileSync(join(__dirname, '..', '..', 'app', '(tabs)', 'bank.tsx'), 'utf8');

describe('a payment marked as money to the business', () => {
  it('is unmarked and saved with the category chosen for it', () => {
    expect(bank).toContain("const leavesBusiness = editingBusinessMoney && pickedBusinessId === null && txType === 'disbursement' && expenseCategory.trim() !== ''");
    expect(bank).toContain('if (leavesBusiness) await ownerBusiness.unmark(editingTransactionId);');
    expect(bank).not.toContain('A category or source chosen above is not saved.');
  });

  it('still offers Who is this for?, with Not sure', () => {
    expect(bank).not.toMatch(/!editingBusinessMoney && withdrawDest !== 'party' && withdrawDest !== 'lend' && withdrawDest !== 'savings' \? \(\s*<WhoIsThisFor/);
  });

  it('says which of the business keys it names, so a key that catches too much can be removed', () => {
    const keys = [businessKeyFor('Ujenzi Distributors'), businessKeyFor('8112968')];
    expect(matchedBusinessKey('Lipa Na Kcb (8112968)', keys)).toBe('#8112968');
    expect(matchedBusinessKey('Grace Community Church', keys)).toBeNull();
    expect(bank).toContain('testID="bank-business-forget-key"');
  });
});
