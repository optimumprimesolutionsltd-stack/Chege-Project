import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/mpesa-import.tsx', 'utf8');

// The debt/loan sheet only offered "Save" and "No, it is not a debt or loan"
// - both write a decision. An accidental open had no way out that left the
// line exactly as it was, unlike the web version, which already had a plain
// Cancel button.
describe('the debt/loan sheet has a true cancel', () => {
  it('closes without touching the line\'s debt state', () => {
    expect(source).toContain('testID="mpesa-debt-cancel"');
    // Calls only setDebtFor(null) - never setDebt(...) - so the line's
    // actual debt choice is left exactly as it was.
    expect(source).toContain('onPress={() => setDebtFor(null)} hitSlop={10} accessibilityLabel="Close without changing anything"');
  });

  it('is distinct from the deliberate "not a debt" answer, which does write a change', () => {
    expect(source).toContain('setDebt(debtFor.index, null);');
    expect(source).toContain('No, it is not a debt or loan');
  });
});
