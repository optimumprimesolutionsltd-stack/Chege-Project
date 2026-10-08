import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// "In all expenses, when I want to edit, the tab flickers first to the bank tab
// before allowing me to edit" (8 Oct 2026).
describe('an edit opened from All expenses or Activity', () => {
  const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');

  it('covers the Bank list while the entry opens and while it goes back', () => {
    expect(bank).toContain('setEditFromElsewhere(true);');
    expect(bank).toContain('testID="bank-edit-cover"');
  });

  it('lifts the cover when Bank loses focus, when the sheet closes with nowhere to go back to, and after 8 s at most', () => {
    expect(bank).toContain('useFocusEffect(useCallback(() => () => setEditFromElsewhere(false), []));');
    expect(bank).toContain('if (sheetWasOpen.current) setEditFromElsewhere(false);');
    expect(bank).toContain('setTimeout(() => setEditFromElsewhere(false), 8000)');
  });
});
