import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// "thought if i select grace community church it should automatically save to donations?"
// (11 Oct 2026): a payee named with a category wins over a business key matching it too.
const read = (...parts: string[]) => readFileSync(join(__dirname, '..', '..', ...parts), 'utf8');

describe('a payee named with a category', () => {
  it('is never marked as money to the business', () => {
    expect(read('hooks', 'useOwnerBusiness.ts')).toContain('!namedFor(row.description, named)?.category');
  });

  it("opens a payment already marked with the payee's category, so Save files it there", () => {
    expect(read('app', '(tabs)', 'bank.tsx')).toContain("setExpenseCategory(filedAsItsOwnFee ? '' : tx.expenseCategory || namedCategory);");
  });

  it('unmarks marked payments it files when the payee is named', () => {
    expect(read('app', 'named-accounts.tsx')).toContain("if (businessMarked.has(row.id)) await customFetch(`/api/owner-business/${row.id}`, { method: 'DELETE' });");
  });
});
