import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { diffRules, firstSync } from '../rulesStore';

// What Jamvi was taught lived on one phone only - lost on a reinstall, never on
// the web or with the other admins (10 Oct 2026).
describe('payee rules kept on the server', () => {
  it('sends only what changed', () => {
    expect(diffRules({ a: 'Rent', b: 'Food', c: 'Fuel' }, { a: 'Rent', b: 'Groceries', d: 'Tithe' }))
      .toEqual({ set: { b: 'Groceries', d: 'Tithe' }, remove: ['c'] });
    expect(diffRules({ a: 'Rent' }, { a: 'Rent' })).toEqual({ set: {}, remove: [] });
  });

  it('a phone first syncing adds what it knew; the server wins a clash', () => {
    expect(firstSync({ a: 'Rent', b: 'Food' }, { b: 'Groceries', c: 'Fuel' }))
      .toEqual({ merged: { a: 'Rent', b: 'Groceries', c: 'Fuel' }, upload: { a: 'Rent' } });
  });

  it('every screen that teaches Jamvi saves through the store, never the phone alone', () => {
    const read = (path: string) => readFileSync(path, 'utf8');
    for (const path of ['app/mpesa-import.tsx', 'app/teach-jamvi.tsx', 'app/(tabs)/bank.tsx', 'hooks/useNamedPayees.ts']) {
      const source = read(path);
      expect(source, path).toContain('saveRules(group?.id');
      expect(source, path).not.toMatch(/AsyncStorage\.setItem\((rulesKey|key), JSON\.stringify\((next|rules|withRule|withSourceRule)/);
    }
    expect(read('app/_layout.tsx')).toContain('useRulesSync(isAuthenticated && !!user?.id && !user?.needsDisplayName);');
  });
});
