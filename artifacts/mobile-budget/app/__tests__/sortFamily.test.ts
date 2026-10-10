import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// "Judy is family. How do I go about it?" (10 Oct 2026) - one tap in Sort them out.
const sort = readFileSync('app/sort-entries.tsx', 'utf8').replace(/\r\n/g, '\n');

describe('Sort them out: Family', () => {
  it('a Family chip on money out, first in the row', () => {
    expect(sort).toContain('testID={`sort-entry-${entry.id}-family`}');
    // First of the money-out chips; money in has its own groups (moneyInGroups).
    const outRow = sort.slice(sort.indexOf('onPress={() => void asFamily(entry)}'));
    expect(outRow.indexOf('sort-entry-${entry.id}-family')).toBeLessThan(outRow.indexOf('sort-entry-${entry.id}-debt'));
  });

  it('files it under the budget\'s family category, made as Teach Jamvi makes it when there is none', () => {
    expect(sort).toContain('familyCategories(categoryList as unknown as Array<{ id: number; name: string; parentId?: number | null }>)[0] ?? FAMILY_CATEGORY');
    expect(sort).toContain('sort(entry, { expenseCategory: familyCategory }, familyCategory);');
  });

  it('keeps the person as family on the server, so their next M-Pesa files itself', () => {
    expect(sort).toContain('const next = withFamily(rules, entry.description, familyCategory);');
    expect(sort).toContain('await saveRules(group?.id, next, rules);');
  });
});
