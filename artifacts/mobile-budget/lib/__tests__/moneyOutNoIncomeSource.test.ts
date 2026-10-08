import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');

// "Should money going out have a source of income?" (8 Oct 2026) - no.
describe('money going out is not offered income streams', () => {
  it('offers none, and says the question is optional', () => {
    expect(bank).not.toContain("Where is this money going?{' '}");
    expect(bank).toContain("{withdrawSources.filter((src) => withdrawDest === 'source' && withdrawSourceName === src.name).map((src) => {");
    expect(bank).toContain("<Text style={{ fontWeight: '400', fontSize: 11 }}>(optional)</Text>");
  });
});
