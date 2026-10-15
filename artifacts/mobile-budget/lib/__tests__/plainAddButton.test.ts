import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// One obvious button that asks the question a child would ask: did I spend
// money, get money, or move money?
describe('the phone footer says it in plain words', () => {
  const fab = read('components/GlobalFAB.tsx');

  // One + in place of the four-button bar (15 Oct 2026).
  it('one + that asks I spent, Bring in M-Pesa, Money in or out, Move money, Save', () => {
    expect(fab).toContain('testID="global-add"');
    for (const label of ['I spent', 'Bring in M-Pesa', 'Save']) expect(fab).toContain(`label: '${label}'`);
    expect(fab).not.toContain("label: 'Budget'");
  });

  it('offers Money in, Money out and Move money instead of Deposit, Withdraw and Transfer', () => {
    expect(fab).toContain("label: 'Money in'");
    expect(fab).toContain("label: 'Money out'");
    expect(fab).toContain("label: 'Move money'");
    for (const word of ["label: 'Deposit'", "label: 'Withdraw'", "label: 'Transfer'"]) {
      expect(fab).not.toContain(word);
    }
  });

  it('keeps stable test ids that do not depend on the wording', () => {
    expect(fab).toContain('testID={`global-add-${action.id}`}');
  });
});

describe('the web Add button says it in plain words', () => {
  const layout = read('../family-budget/src/components/layout.tsx');
  it('reads Add, with I spent money and I received money', () => {
    expect(layout).toContain('<span className="text-sm font-bold">Add</span>');
    expect(layout).toContain('I spent money</span>');
    expect(layout).toContain('I received money</span>');
    expect(layout).toContain('What do you want to add?');
    expect(layout).not.toContain('>Quick log<');
  });
});
