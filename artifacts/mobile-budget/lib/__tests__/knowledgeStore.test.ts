import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KNOWLEDGE, pickDoc } from '../knowledgeStore';

// Named accounts, your business's numbers, other budgets' payees and nicknames
// lived on one phone (10 Oct 2026): kept on the server now, the phone a cache.
describe('the rest of what Jamvi was taught, on the server', () => {
  it('covers the four documents, under the keys the phone always used', () => {
    expect(Object.keys(KNOWLEDGE)).toEqual(['named-payees', 'owner-business', 'other-budget-rules', 'payee-nicknames']);
    expect(KNOWLEDGE['named-payees'](5)).toBe('jamvi:named-payees:5');
  });

  it('takes the server\'s copy, unless it has none yet or this phone saved while it could not hear', () => {
    expect(pickDoc([{ key: 'a' }], [{ key: 'b' }], false)).toEqual({ doc: [{ key: 'b' }], upload: false });
    expect(pickDoc([{ key: 'a' }], [], false)).toEqual({ doc: [{ key: 'a' }], upload: true });
    expect(pickDoc({ x: 1 }, null, false)).toEqual({ doc: { x: 1 }, upload: true });
    expect(pickDoc([{ key: 'a' }], [{ key: 'b' }], true)).toEqual({ doc: [{ key: 'a' }], upload: true });
    expect(pickDoc(null, null, false)).toEqual({ doc: null, upload: false });
  });

  it('every save goes through the store', () => {
    const read = (path: string) => readFileSync(path, 'utf8');
    expect(read('hooks/useNamedPayees.ts')).toContain("await saveKnowledge(group?.id, 'named-payees', next);");
    expect(read('hooks/useOwnerBusiness.ts')).toContain("await saveKnowledge(group?.id, 'owner-business', next);");
    const importScreen = read('app/mpesa-import.tsx');
    expect(importScreen).toContain("void saveKnowledge(group?.id, 'other-budget-rules', next);");
    expect(importScreen).toContain("void saveKnowledge(group?.id, 'payee-nicknames', next);");
    expect(read('hooks/useRulesSync.ts')).toContain('void syncKnowledge(groupId)');
  });
});
