import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const screen = readFileSync('app/mpesa-import.tsx', 'utf8');

describe('Fix these for me', () => {
  it('removes only the proven duplicates, after one confirmation', () => {
    expect(screen).toContain('const fixableExtras = (extras?.rows ?? []).filter((row) => row.fixable);');
    expect(screen).toContain("text: 'Remove them',");
    expect(screen).toContain('testID="mpesa-fix-extras"');
  });
});

describe('Add missing charges', () => {
  it('adds each beside its payment, under the charges category, after one confirmation', () => {
    expect(screen).toContain('chargeForTransactionId: charge.parentId,');
    expect(screen).toContain("text: 'Add them',");
    expect(screen).toContain('testID="mpesa-add-missing"');
  });
});
