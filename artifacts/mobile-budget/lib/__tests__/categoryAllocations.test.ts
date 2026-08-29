import { describe, expect, it } from 'vitest';
import {
  getCategoryAllocationStatus,
  hasOtherCategoryAllocation,
  hydrateCategoryAllocations,
} from '../expenseFundingPreservation';

describe('getCategoryAllocationStatus', () => {
  it('accepts distinct positive whole-KES allocations that exactly match the expense', () => {
    expect(getCategoryAllocationStatus(1_000, [
      { category: 'Food', amount: 600 },
      { category: 'Transport', amount: 400 },
    ])).toMatchObject({ total: 1_000, difference: 0, isExact: true, hasInvalidAllocation: false });
  });

  it('reports remaining, excess, and invalid fractional allocations', () => {
    expect(getCategoryAllocationStatus(1_000, [{ category: 'Food', amount: 750 }]).difference).toBe(250);
    expect(getCategoryAllocationStatus(1_000, [{ category: 'Food', amount: 1_100 }]).difference).toBe(-100);
    expect(getCategoryAllocationStatus(1_000, [{ category: 'Food', amount: 100.5 }]).isExact).toBe(false);
  });

  it('keeps Food as the legacy category when Other is a secondary allocation', () => {
    const allocations = hydrateCategoryAllocations('Food', 1_000, [
      { category: 'Food', amount: 750 },
      { category: 'Other', amount: 250 },
    ]);

    expect(allocations).toEqual([
      { category: 'Food', amount: 750 },
      { category: 'Other', amount: 250 },
    ]);
    expect(allocations[0].category).toBe('Food');
    expect(hasOtherCategoryAllocation(allocations)).toBe(true);
  });

  it('hydrates an existing unbudgeted label without replacing it with Other', () => {
    expect(hydrateCategoryAllocations('Vet emergency', 2_400)).toEqual([
      { category: 'Vet emergency', amount: 2_400 },
    ]);
    expect(hydrateCategoryAllocations('Food', 2_400, [
      { category: 'Vet emergency', amount: 2_400 },
    ])).toEqual([{ category: 'Vet emergency', amount: 2_400 }]);
  });
});