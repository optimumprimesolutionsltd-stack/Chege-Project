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
