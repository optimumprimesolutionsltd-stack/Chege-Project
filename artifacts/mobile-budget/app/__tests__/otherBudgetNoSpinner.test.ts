import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/mpesa-import.tsx', 'utf8');

// Reported: the "No" chip under "Does this belong to a different budget you
// run?" always showed a spinner instead of its own label. The "No" option's
// id is null, and the loading flag also defaults to null when nothing is
// loading - so `loadingOtherBudget === option.id` read as true for "No"
// whenever nothing was actually loading, since null === null.
describe('the "No" chip under "different budget" never shows a stuck spinner', () => {
  it('excludes the null-id option from the loading check', () => {
    expect(source).toContain("opacity: option.id !== null && loadingOtherBudget === option.id ? 0.6 : 1");
    expect(source).toContain('{option.id !== null && loadingOtherBudget === option.id ? (');
  });

  it('never compares against the loading flag without the null guard first', () => {
    // Every occurrence must be guarded; an unguarded one would re-introduce
    // the null === null collision for the "No" option.
    const occurrences = source.match(/loadingOtherBudget === option\.id/g) ?? [];
    const guarded = source.match(/option\.id !== null && loadingOtherBudget === option\.id/g) ?? [];
    expect(occurrences.length).toBeGreaterThan(0);
    expect(guarded.length).toBe(occurrences.length);
  });
});
