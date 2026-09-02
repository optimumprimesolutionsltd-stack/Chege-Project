import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const search = readFileSync('app/(tabs)/search.tsx', 'utf8');
const tabs = readFileSync('app/(tabs)/_layout.tsx', 'utf8');

describe('workspace search', () => {
  it('provides a main Search tab and scoped record filters', () => {
    expect(tabs).toContain('name="search"');
    expect(search).toContain("customFetch<SearchResponse>(`/api/search");
    expect(search).toContain("{ key: 'expenses', label: 'Expenses' }");
    expect(search).toContain("{ key: 'bank', label: 'Bank' }");
    expect(search).toContain("{ key: 'goals', label: 'Goals' }");
    expect(search).toContain("{ key: 'income', label: 'Income' }");
    expect(search).toContain('Results stay inside the selected budget.');
  });
});