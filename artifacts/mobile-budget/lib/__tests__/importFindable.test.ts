import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mpesaCardKey } from '@/lib/mpesaCard';

// "I couldn't see how to import a statement in Personal."
describe('the statement import can be found in every workspace', () => {
  it('is named for statements as well as messages', () => {
    expect(readFileSync('app/(tabs)/more.tsx', 'utf8')).toContain("title: 'Import M-Pesa',");
    expect(readFileSync('app/mpesa-import.tsx', 'utf8')).toContain('Read your M-Pesa statement, or paste messages, into entries');
  });

  it('is on the Bank tab, where the money is', () => {
    expect(readFileSync('app/(tabs)/bank.tsx', 'utf8')).toContain('testID="bank-import-mpesa"');
  });

  it("remembers the Home card for each workspace, so using it in a group leaves it on Personal", () => {
    expect(mpesaCardKey(3)).toBe('jamvi:mpesa-card:3');
    expect(mpesaCardKey(7)).not.toBe(mpesaCardKey(3));
    expect(readFileSync('components/MpesaImportCard.tsx', 'utf8')).toContain('AsyncStorage.getItem(mpesaCardKey(groupId))');
  });
});
