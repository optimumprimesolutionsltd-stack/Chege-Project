import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(__dirname, '..', '..', path), 'utf8');

// "I have always chosen who I am borrowing from" - Reports said 350,355 borrowed, Who owes who said nobody.
describe('borrowing and lending with nobody linked', () => {
  it('is listed on Who owes who to be given its person, the named one first', () => {
    const list = read('components/UnlinkedDebts.tsx');
    expect(list).toContain("customFetch<{ entries: Unlinked[] }>('/api/contributors/unlinked-debts')");
    expect(list).toContain("await customFetch('/api/debt-links', {");
    expect(list).toContain('testID="parties-unlinked-link-suggested"');
    expect(list).toContain('const order = [...parties].sort((a, b) => (a.id === entry.suggestedPartyId ? -1 : b.id === entry.suggestedPartyId ? 1 : 0));');
    expect(read('app/parties.tsx')).toContain('<UnlinkedDebts');
  });

  it('sends the person with a save on the server, so closing Jamvi mid-save keeps it', () => {
    expect(read('app/mpesa-import.tsx')).toContain('...(choice.debt ? { debt: { partyId: choice.debt.partyId, kind: choice.debt.kind } } : {})');
    expect(read('lib/serverSave.ts')).toContain("debt?: { partyId: number; kind: 'borrowed' | 'pay-back' | 'lend' | 'repaid' }");
  });
});
