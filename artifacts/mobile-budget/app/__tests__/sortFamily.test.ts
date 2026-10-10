import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// "Judy is family. How do I go about it?" (10 Oct 2026) - one tap in Sort them out.
const sort = readFileSync('app/sort-entries.tsx', 'utf8').replace(/\r\n/g, '\n');

describe('Sort them out: Family', () => {
  it('a Family chip on money out, first in the row', () => {
    expect(sort).toContain('testID={`sort-entry-${entry.id}-family`}');
    expect(sort.indexOf('sort-entry-${entry.id}-family')).toBeLessThan(sort.indexOf('sort-entry-${entry.id}-debt'));
  });

  // "Under family support hope it's the parent and subcategories are the people" (10 Oct 2026).
  it("files it on the person's own line under Family support (lib/familyPeople)", () => {
    expect(sort).toContain('const made = await familyLines.lineFor(entry.description, rules);');
    expect(sort).toContain('sort(entry, { expenseCategory: line }, line);');
  });

  it('keeps the person as family on the server, so their next M-Pesa files itself', () => {
    expect(sort).toContain('await saveRules(group?.id, made.rules, rules);');
  });
});
