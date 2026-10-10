import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { familyPlan, OTHER_FAMILY, personLine, rulesAfterConversion } from '@/lib/familyPeople';
import { withOwnBusinessPayee, EMPTY_BUSINESS } from '@/lib/ownerBusiness';

// "Under family support hope it's the parent and subcategories are the people" (10 Oct 2026).
describe('each family member their own line under Family support', () => {
  it('named as M-Pesa writes them, tidied', () => {
    expect(personLine('JANE WANJIRU')).toBe('Jane Wanjiru');
    expect(personLine('Received from MARY ATIENO')).toBe('Mary Atieno');
  });

  it('under the Family support heading; a new heading when there is none; their line when it is there', () => {
    const heading = { id: 1, name: 'Family support', parentId: null, priority: 2 };
    const parents = { id: 2, name: 'Parents', parentId: 1 };
    expect(familyPlan([heading, parents], 'Jane Wanjiru')).toEqual({ kind: 'under', parentId: 1, priority: 2 });
    expect(familyPlan([], 'Jane Wanjiru')).toEqual({ kind: 'new-heading' });
    expect(familyPlan([heading, parents, { id: 3, name: 'jane wanjiru', parentId: 1 }], 'Jane Wanjiru')).toEqual({ kind: 'exists', name: 'jane wanjiru' });
  });

  it('a Family support that held money itself becomes Other family under a new heading, and its rules follow', () => {
    expect(familyPlan([{ id: 9, name: 'Family support', parentId: null, priority: 3 }], 'Jane Wanjiru')).toEqual({ kind: 'convert', leafId: 9, priority: 3 });
    expect(rulesAfterConversion({ 'mary atieno': 'Family support', naivas: 'Groceries' })).toEqual({ 'mary atieno': OTHER_FAMILY, naivas: 'Groceries' });
    const lib = readFileSync('lib/familyPeople.ts', 'utf8');
    // Renamed first, so its entries go along; then moved under the heading.
    expect(lib.indexOf('await put(plan.leafId, { name: OTHER_FAMILY });')).toBeLessThan(lib.indexOf('if (heading) await put(plan.leafId, { parentId: heading.id });'));
  });

  it('added from Teach Jamvi, the import review and Sort them out, with nothing to choose', () => {
    for (const screen of ['app/teach-jamvi.tsx', 'app/mpesa-import.tsx']) {
      const source = readFileSync(screen, 'utf8');
      expect(source).toContain('const made = await familyLines.lineFor(name, rules);');
      expect(source).toContain("category === FAMILY_CATEGORY && taught.kind === 'person'");
    }
    expect(readFileSync('components/FamilyNamesCard.tsx', 'utf8')).toContain('void add(name.trim(), choices[0]);');
  });
});

// "What happens if ujenzi is my business?" (10 Oct 2026).
describe('a payee that is the person’s own business', () => {
  it('kept by its account number when a bank named one, else by name; the business named the first time', () => {
    const byName = withOwnBusinessPayee(EMPTY_BUSINESS, { label: 'Ujenzi Distributors Ltd', reference: '' }, { id: 7, name: 'Ujenzi' });
    expect(byName).toMatchObject({ name: 'Ujenzi', incomeSourceId: 7, keys: ['ujenzi distributors ltd'] });
    const byNumber = withOwnBusinessPayee(byName, { label: 'Equity Paybill Account', reference: '0870193430866' }, { id: 8, name: 'Other' });
    expect(byNumber).toMatchObject({ name: 'Ujenzi', incomeSourceId: 7, keys: ['ujenzi distributors ltd', '#0870193430866'] });
  });

  it('offered on the card, never asked again, and marked once saved', () => {
    const card = readFileSync('components/TeachJamviCard.tsx', 'utf8');
    expect(card).toContain("chip('My own business'");
    expect(card).toContain("chip('From my own business'");
    const importScreen = readFileSync('app/mpesa-import.tsx', 'utf8');
    expect(importScreen).toContain('.filter((group) => !namesBusiness(group.sample.description, ownerBusiness.matching.keys))');
    expect(importScreen).toContain('if (ownBusinessIds.length > 0) void ownerBusiness.mark(ownBusinessIds).catch(() => {});');
    expect(readFileSync('app/teach-jamvi.tsx', 'utf8')).toContain('await ownerBusiness.mark(ids);');
  });
});

// "What happens if I'm paying to my personal acc?" (10 Oct 2026).
describe('an account number Jamvi does not know, on an import line', () => {
  it("It's mine: added with its number, and every line to or from it a move", () => {
    const importScreen = readFileSync('app/mpesa-import.tsx', 'utf8');
    expect(importScreen).toContain('testID={`mpesa-line-move-${item.index}-mine`}');
    expect(importScreen).toContain('const created = await createAccount({ data: { name: found.name, accountNumber: found.number } });');
    expect(importScreen).toContain('startTransition(() => setChoices((current) => withOwnAccounts(lines, current, added, rules)));');
  });
});
