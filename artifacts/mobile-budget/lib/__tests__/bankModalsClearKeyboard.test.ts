import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');

// On Android these sheets sat at the bottom with no keyboard avoidance, so the
// keyboard (opened by autoFocus) covered the Save button of "Add bank account".
// Reported as: "save account not visible".
describe('bank sheets keep their buttons above the keyboard on Android', () => {
  it('never turns keyboard avoidance off for Android', () => {
    expect(bank).not.toContain("'padding' : undefined");
  });
  it('uses height avoidance on Android, as the main transaction sheet does', () => {
    expect(bank).toContain("behavior={Platform.OS === 'ios' ? 'padding' : 'height'}");
  });
});
