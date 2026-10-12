import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// "a payment made to one of my businesses, if i select the business it should
// automatically register, whether its lending or repaying is irrelevant as the logic is
// directors drawings" - "its a long process. it doesnt pick the business and save" (12 Oct 2026).
const read = (...parts: string[]) => readFileSync(join(__dirname, '..', '..', ...parts), 'utf8');
const bank = read('app', '(tabs)', 'bank.tsx');

describe('money out to one of my businesses', () => {
  it('each business is a choice under What kind of money is this?', () => {
    expect(bank).toContain("TO ONE OF MY BUSINESSES - DIRECTOR'S MONEY");
    expect(bank).toContain('testID={`bank-withdraw-to-business-${business.id}`}');
  });

  it('saves with no category, lending or paying back, and is marked for that business', () => {
    expect(bank).toContain('const businessMoney = (editingBusinessMoney && !leavesBusiness) || toBusiness;');
    expect(bank).toContain('if (toBusiness && pickedBusinessId !== null) await ownerBusiness.mark([editingTransactionId], pickedBusinessId);');
    expect(bank).toContain('await ownerBusiness.mark([createdPostingId], pickedBusinessId);');
    expect(bank).toContain("isWithdrawal && withdrawDest !== 'savings' && withdrawDest !== 'lend' && toBusinessId === null && forBusinessId === null && (");
  });

  it('shows which business, not only the first one set up', () => {
    expect(bank).toContain("businessTitle(dep ? 'in' : 'out', businessNameOf(ownerBusiness.businessIdOf(item.id)))");
    expect(read('hooks', 'useOwnerBusiness.ts')).toContain('...(incomeSourceId ? { incomeSourceId } : {})');
  });

  it('the server keeps which business it went to', () => {
    const server = (...parts: string[]) => readFileSync(join(__dirname, '..', '..', '..', 'api-server', 'src', ...parts), 'utf8');
    expect(server('lib', 'owner-business-money.ts')).toContain('ADD COLUMN IF NOT EXISTS "income_source_id"');
    expect(server('routes', 'owner-business.ts')).toContain('businessOf: await ownerBusinessOf(groupId)');
    expect(server('routes', 'owner-business.ts')).toContain('That is not one of your businesses.');
  });
});
