import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const panel = readFileSync('components/ReversalLink.tsx', 'utf8');
const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');

// A reversal - a payment that did not go through coming back - read as income
// while the payment it undid still read as spending. Linking the two cancels
// both; the balance is untouched.
describe('linking money back to the payment it reversed', () => {
  it('is offered in the sheet for the entry being edited', () => {
    expect(bank).toContain('<ReversalLink');
    expect(bank).toContain('canManage={canManageAccount}');
    expect(bank).toContain('onChanged={invalidateBalance}');
  });

  it('asks the server only for a deposit, and only for those who can link', () => {
    expect(panel).toContain('enabled: isDeposit && canManage');
  });

  it('offers only the payments the server matched, by exact amount and date', () => {
    expect(panel).toContain('data.candidates.map((candidate) => (');
    expect(panel).toContain("await link({ id: transaction.id, data: { originalTransactionId: originalId } });");
  });

  it('says so when nothing matches, instead of offering a guess', () => {
    expect(panel).toContain('testID="reversal-none"');
  });

  it('does not ask on every deposit, only one that could be money back', () => {
    expect(panel).toContain('if (data.candidates.length === 0 && !saysMoneyBack) return null;');
  });

  it('shows what it is linked to, and can undo it after asking', () => {
    expect(panel).toContain('testID="reversal-linked"');
    expect(panel).toContain("'Unlink this reversal?'");
    expect(panel).toContain('await unlink({ id: transaction.id });');
  });

  it('refreshes every balance and total the link changes', () => {
    expect(panel).toContain('await queryClient.invalidateQueries({ queryKey: getGetReversalQueryKey(transaction.id) });');
    expect(panel).toContain('onChanged();');
  });

  it('tells somebody opening the payment where to undo it', () => {
    expect(panel).toContain('testID="reversal-payment-note"');
    expect(panel).toContain('open that money back and unlink it first');
  });

  it('stays out of the way until the server has reversals', () => {
    expect(panel).toContain('if (!canManage || isLoading || !data?.available) return null;');
  });
});

describe('the bank list names both halves', () => {
  it('calls the deposit money back, and the payment reversed', () => {
    expect(bank).toContain("item.reversal?.role === 'money_back' ? `Money back · reverses ${item.reversal.otherDescription}`");
    expect(bank).toContain("item.reversal?.role === 'reversed_payment' ? `Reversed · ${item.description}`");
  });
});

describe('matching reversals without opening each one', () => {
  const mpesa = readFileSync('app/mpesa-import.tsx', 'utf8');

  it('happens by itself after an import that saved a reversal', () => {
    expect(mpesa).toContain("lines.some((line) => line.type === 'reversal' && savedIndexes.has(line.index))");
    expect(mpesa).toContain('void autoLinkReversals()');
  });

  it('is one tap in Bank for money-back entries already there, and says what is left', () => {
    expect(bank).toContain('testID="bank-match-reversals"');
    expect(bank).toContain("/^money back/i.test(transaction.description ?? '') && !transaction.reversal");
    expect(bank).toContain("'no payment of that amount is recorded'");
  });
});
