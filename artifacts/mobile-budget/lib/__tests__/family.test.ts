import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { initialChoices, type PreviewLine } from '../mpesaImport';
import { displayName, familyCategories, familyNames, fileFamilyLines, relativesBySurname, withFamily, withoutFamily } from '../family';
import { ruleCategory } from '../payeeLearning';

// "Also ask for family names" (9 Oct 2026): money to them is family support, never a shop.
describe('your family, asked once', () => {
  const rows = [
    { id: 1, name: 'Family support', parentId: null },
    { id: 2, name: 'Parents', parentId: 1 },
    { id: 3, name: 'Siblings', parentId: 1 },
    { id: 4, name: 'Groceries', parentId: null },
  ];

  it('files under the family subcategories when the budget has them, the family category itself otherwise', () => {
    expect(familyCategories(rows)).toEqual(['Parents', 'Siblings']);
    expect(familyCategories([{ id: 9, name: 'Family support' }])).toEqual(['Family support']);
    expect(familyCategories([{ id: 4, name: 'Groceries' }])).toEqual([]);
  });

  it('keeps each name as a payee rule, found again however M-Pesa writes the spacing or case', () => {
    const rules = withFamily({}, 'JANE  WANJIKU Kamau', 'Parents');
    expect(ruleCategory('Jane Wanjiku Kamau', rules)).toBe('Parents');
    expect(familyNames({ ...rules, '#ref:5846630': 'Parents', 'src:acme': '3', kplc: 'Electricity' }, ['Parents', 'Siblings']))
      .toEqual([{ key: 'jane wanjiku kamau', category: 'Parents' }]);
    expect(withoutFamily(rules, 'jane wanjiku kamau')).toEqual({});
    expect(displayName('jane wanjiku kamau')).toBe('Jane Wanjiku Kamau');
  });

  it('offers the people paid who share the surname, never a shop or someone already kept', () => {
    expect(relativesBySurname(['JOHN KAMAU', 'MARY WANJIRU', 'KAMAU HARDWARE LTD', 'Jane Kamau', 'JOHN KAMAU'], 'Kamau', ['jane kamau']))
      .toEqual(['JOHN KAMAU']);
    expect(relativesBySurname(['JOHN KAMAU'], null, [])).toEqual([]);
  });

  it('files their lines in the review now, checked and remembered, leaving the person\'s own choices', () => {
    let n = 0;
    const line = (over: Partial<PreviewLine>): PreviewLine => ({ index: n++, status: 'ready', reason: null, receipt: `R${n}`, direction: 'out', type: 'person_payment', amount: 500, description: 'JOHN KAMAU', date: '2026-09-01', fee: null, mpesaBalance: null, alreadyRecorded: null, ...over });
    const lines = [line({}), line({}), line({ description: 'MARY WANJIRU' })];
    const choices = initialChoices(lines, [], ['Parents']);
    choices[1] = { ...choices[1], category: 'Rent', auto: false };
    const filed = fileFamilyLines(lines, choices, 'John Kamau', 'Parents');
    expect(filed[0]).toMatchObject({ category: 'Parents', confirmed: true, remember: true });
    expect(filed[1].category).toBe('Rent');
    expect(filed[2].category).toBe(choices[2].category);
  });

  it('is asked in the M-Pesa review and on Teach Jamvi', () => {
    expect(readFileSync('app/mpesa-import.tsx', 'utf8')).toContain('<FamilyNamesCard');
    expect(readFileSync('app/teach-jamvi.tsx', 'utf8')).toContain('<FamilyNamesCard');
  });
});
