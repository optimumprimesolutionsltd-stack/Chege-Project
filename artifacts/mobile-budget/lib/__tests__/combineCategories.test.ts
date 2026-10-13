import { describe, expect, it } from 'vitest';
import { twinToCombine, withCategoryMoved } from '@/lib/combineCategories';

// "rent share and rent are one and the same thing. i do not want two
// categories" (13 Oct 2026): onboarding's Shared bills beside Housing.
const budget = [
  { id: 10, name: 'Housing', parentId: null },
  { id: 11, name: 'Rent', parentId: 10 },
  { id: 20, name: 'Shared bills', parentId: null },
  { id: 21, name: 'Rent share', parentId: 20 },
  { id: 22, name: 'Bills share', parentId: 20 },
  { id: 23, name: 'Shopping share', parentId: 20 },
  { id: 30, name: 'Food', parentId: null },
  { id: 31, name: 'Groceries', parentId: 30 },
  { id: 40, name: 'Utilities', parentId: null },
  { id: 41, name: 'Electricity', parentId: 40 },
  { id: 42, name: 'Water', parentId: 40 },
];

describe('categories onboarding made twice', () => {
  it('asks Rent share into Rent first', () => {
    expect(twinToCombine(budget)).toEqual({ from: { id: 21, name: 'Rent share' }, into: [{ id: 11, name: 'Rent' }] });
  });

  it('then Shopping share into Groceries, and Bills share into one of the Utilities', () => {
    expect(twinToCombine(budget, [21])).toEqual({ from: { id: 23, name: 'Shopping share' }, into: [{ id: 31, name: 'Groceries' }] });
    expect(twinToCombine(budget, [21, 23])).toEqual({
      from: { id: 22, name: 'Bills share' },
      into: [{ id: 41, name: 'Electricity' }, { id: 42, name: 'Water' }],
    });
  });

  it('never asks with nowhere to combine into, or once everything is combined', () => {
    // A friends' budget with Rent share and no Rent: nothing to answer.
    expect(twinToCombine([{ id: 20, name: 'Shared bills' }, { id: 21, name: 'Rent share', parentId: 20 }])).toBeNull();
    expect(twinToCombine(budget.filter((category) => category.parentId !== 20 && category.id !== 20))).toBeNull();
    expect(twinToCombine(budget, [21, 22, 23])).toBeNull();
  });

  it('moves the payees filed there, not money-in rules', () => {
    expect(withCategoryMoved({ 'jane wanjiku': 'Rent share', '#522522': 'Groceries', 'src:jane': 'Rent share' }, 'Rent share', 'Rent'))
      .toEqual({ 'jane wanjiku': 'Rent', '#522522': 'Groceries', 'src:jane': 'Rent share' });
  });
});
