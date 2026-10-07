import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('@workspace/api-client-react', () => ({ customFetch: fetchMock }));

import { headingsOf, placementFor, standardTargetFor } from '@/lib/standardCategory';
import { createInPlace } from '@/lib/createStandardCategory';

// "Offering to create a category in one tap may lack a parent ... and the tier
// too" (7 Oct 2026): a new category always goes under a heading, in a tier.
describe('the standard place for a payee Jamvi knows', () => {
  it('is a subcategory under its standard heading, in that heading\'s tier', () => {
    expect(standardTargetFor('NAIVAS WESTLANDS')).toEqual({ name: 'Groceries', parent: 'Food', priority: 1 });
    expect(standardTargetFor('MAGUNAS SUPERMARKET')).toEqual({ name: 'Groceries', parent: 'Food', priority: 1 });
    expect(standardTargetFor('KPLC PREPAID')).toEqual({ name: 'Electricity', parent: 'Utilities', priority: 1 });
    expect(standardTargetFor('JAVA HOUSE')).toEqual({ name: 'Eating out', parent: 'Food', priority: 1 });
    expect(standardTargetFor('GOODLIFE PHARMACY')?.parent).toBe('Health');
  });

  it('is nothing for a payee Jamvi does not know, or one with no place in the tree', () => {
    expect(standardTargetFor('Alice Mwangi')).toBeNull();
    expect(standardTargetFor('KRA')).toBeNull();
  });
});

describe('where it goes in this budget', () => {
  const rows = [
    { id: 1, name: 'Food', parentId: null, priority: 2 },
    { id: 2, name: 'Eating out', parentId: 1, priority: 2 },
    { id: 3, name: 'Utilities', parentId: null, priority: 1 },
    { id: 4, name: 'Transport', parentId: null, priority: 1 },
    { id: 5, name: 'Fuel', parentId: 4, priority: 1 },
  ];

  it('under the person\'s own heading, in their tier for it', () => {
    expect(placementFor('Food', 1, rows)).toEqual({ kind: 'existing', parentId: 1, parentName: 'Food', priority: 2 });
  });

  it('under a new heading in its standard tier when there is none', () => {
    expect(placementFor('Health', 2, rows)).toEqual({ kind: 'new-heading', parentName: 'Health', priority: 2 });
  });

  it('asks when a category of that name is not a heading, so nothing filed under it ends up under a heading', () => {
    expect(placementFor('Utilities', 1, rows)).toEqual({ kind: 'ask' });
    expect(placementFor('Eating out', 1, rows)).toEqual({ kind: 'ask' });
  });

  it('offers only real headings to choose from', () => {
    expect(headingsOf(rows).map((row) => row.name)).toEqual(['Food', 'Transport']);
  });
});

describe('making it', () => {
  beforeEach(() => fetchMock.mockReset());

  it('makes a new heading first, then the subcategory under it, both in the tier and with no budget', async () => {
    fetchMock.mockResolvedValueOnce({ id: 70, name: 'Food' }).mockResolvedValueOnce({ id: 71, name: 'Groceries' });
    await expect(createInPlace('Groceries', { kind: 'new-heading', parentName: 'Food', priority: 1 })).resolves.toBe('Groceries');
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));
    expect(bodies[0]).toMatchObject({ name: 'Food', parentId: null, priority: 1, budgetAmount: 0 });
    expect(bodies[1]).toMatchObject({ name: 'Groceries', parentId: 70, priority: 1, budgetAmount: 0 });
  });

  it('only the subcategory when the heading is already there', async () => {
    fetchMock.mockResolvedValueOnce({ id: 72, name: 'Groceries' });
    await createInPlace(' Groceries ', { kind: 'existing', parentId: 1, priority: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ name: 'Groceries', parentId: 1, priority: 2 });
  });
});

describe('offered where an entry has no category', () => {
  it('on import lines left Not sure, and in Sort them out where there is no suggestion', () => {
    expect(readFileSync('app/mpesa-import.tsx', 'utf8')).toContain('testID={`mpesa-line-new-category-${item.index}`}');
    expect(readFileSync('app/sort-entries.tsx', 'utf8')).toContain("entry.direction === 'out' && !suggestions.has(entry.id) ? (");
  });
});
