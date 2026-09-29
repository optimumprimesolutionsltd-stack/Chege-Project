import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const screen = readFileSync('app/spending-by-item.tsx', 'utf8').replace(/\r\n/g, '\n');

// Stock for a side hustle sat among the groceries on What you spend on.
describe('What you spend on', () => {
  it('has a Household tab and a Business costs tab when there is a side hustle', () => {
    expect(screen).toContain("{ value: 'business' as const, label: 'Business costs' },");
    expect(screen).toContain('{scoped && hasBusiness ? (');
  });

  it('keeps business costs out of the household list, and lets one category decide for itself', () => {
    expect(screen).toContain("...(scoped ? { scope: hasBusiness ? scope : ('household' as const) } : {}),");
    expect(screen).toContain('const scoped = !category;');
  });
});
