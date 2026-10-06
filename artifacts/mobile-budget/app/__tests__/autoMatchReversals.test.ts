import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const business = readFileSync('app/business.tsx', 'utf8');
const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');

// "Reversals are showing on cost of goods. That is why I made a loss."
describe('money back is matched to its payment without waiting for an import', () => {
  it('when Business opens', () => {
    expect(business).toContain('autoLinkReversals()');
  });

  it('on Bank, once, when unmatched money back is on screen, for whoever can manage the account', () => {
    expect(bank).toContain('if (autoMatched.current || !canManageAccount || unmatchedMoneyBack.length === 0) return;');
  });
});

// "I should be able to press ignore or something" (6 Oct 2026): the message
// listing what could not be matched now offers a way on, not only OK.
describe('money back that could not be matched on its own', () => {
  it('can be opened to choose its payment', () => {
    expect(bank).toContain("{ text: 'Choose the payment', onPress: () => openEdit(first) }");
  });

  it('can be left as money in, and is then no longer counted or asked about on this phone', () => {
    expect(bank).toContain("{ text: 'Leave as money in', onPress: () => leaveMoneyBack(needsYou.map((item) => item.id)) }");
    expect(bank).toContain('!transaction.reversal && !moneyBackLeft.has(transaction.id)');
    expect(bank).toContain('AsyncStorage.setItem(MONEY_BACK_LEFT_KEY');
  });
});
