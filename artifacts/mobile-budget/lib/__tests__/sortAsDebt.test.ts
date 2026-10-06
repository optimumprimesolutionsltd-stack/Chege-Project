import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { debtKindsFor, partiesToOffer, suggestedParty } from '@/lib/sortAsDebt';

// "I can't see the logic of debt option here... adding debtor/creditor" (6 Oct 2026).
describe('sorting an entry out as a debt', () => {
  it('offers lending or paying back for money out, borrowing or being paid back for money in', () => {
    expect(debtKindsFor('out').map((option) => option.kind)).toEqual(['lend', 'pay-back']);
    expect(debtKindsFor('in').map((option) => option.kind)).toEqual(['borrowed', 'repaid']);
  });

  it('needs the person only when a balance is being paid back', () => {
    expect(debtKindsFor('out').find((option) => option.kind === 'pay-back')?.needsPerson).toBe(true);
    expect(debtKindsFor('out').find((option) => option.kind === 'lend')?.needsPerson).toBe(false);
    expect(debtKindsFor('in').find((option) => option.kind === 'repaid')?.needsPerson).toBe(true);
  });

  it('picks the person the description names, and nobody when it could be two', () => {
    const parties = [{ id: 1, name: 'Alice Mwangi' }, { id: 2, name: 'Abel Ndegwa' }, { id: 3, name: 'Mwangi' }];
    // "Alice Mwangi" names both Alice Mwangi and Mwangi: nobody is guessed.
    expect(suggestedParty('Alice Mwangi 0712***678', parties)).toBeNull();
    expect(suggestedParty('Alice Mwangi 0712***678', parties.slice(0, 2))?.id).toBe(1);
    expect(suggestedParty('Abel Ndegwa', parties)?.id).toBe(2);
    expect(suggestedParty('Equity Paybill Account', parties)).toBeNull();
  });

  it('is on every entry in Sort them out, and can be undone', () => {
    const screen = readFileSync('app/sort-entries.tsx', 'utf8');
    expect(screen).toContain('testID={`sort-entry-${entry.id}-debt`}');
    expect(screen).toContain('<SortAsDebt');
    const sheet = readFileSync('components/SortAsDebt.tsx', 'utf8');
    expect(sheet).toContain("await customFetch(`/api/entries-to-sort/${one.id}/debt`, { method: 'DELETE' });");
  });
});

describe('who the debt sheet offers', () => {
  const parties = [
    { id: 1, name: 'Fuliza' }, { id: 2, name: 'Hermda traders' }, { id: 3, name: 'M-Shwari' },
    { id: 4, name: 'KCB M-PESA' }, { id: 5, name: 'Hustler Fund' }, { id: 6, name: 'Safaricom PLC' }, { id: 7, name: 'Judy mundara' },
  ];

  it('leaves out the lenders the M-Pesa import links by itself', () => {
    expect(partiesToOffer(parties, null).map((party) => party.name)).toEqual(['Hermda traders', 'Judy mundara']);
  });

  it('still offers one when the entry names it', () => {
    expect(partiesToOffer(parties, parties[0]).map((party) => party.id)).toEqual([1, 2, 7]);
  });

  it('keeps Save clear of the navigation bar', () => {
    const sheet = readFileSync('components/SortAsDebt.tsx', 'utf8');
    expect(sheet).toContain('paddingBottom: Math.max(insets.bottom, 16) + 4');
    expect(sheet).toContain('{offered.map((party) => (');
  });
});
