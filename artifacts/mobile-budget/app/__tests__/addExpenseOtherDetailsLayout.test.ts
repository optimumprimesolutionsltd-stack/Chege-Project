import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/add-expense.tsx', 'utf8');

describe('Other expense details layout', () => {
  it('places Other details after category tabs and before allocation rows', () => {
    const otherDetails = source.indexOf('testID="other-expense-details"');
    const allocationCard = source.indexOf('testID="category-allocation-card"');

    expect(otherDetails).toBeGreaterThan(source.indexOf('</ScrollView>'));
    expect(otherDetails).toBeLessThan(allocationCard);
  });

  it('shows Other details for any allocation and excludes create-category UI', () => {
    expect(source).toContain(
      'const hasOtherCategorySelected = hasOtherCategoryAllocation(categoryAllocations);',
    );
    expect(source).toContain('{hasOtherCategorySelected && (');
    expect(source).toContain('{isCreatingCategory && !hasOtherCategorySelected ? (');
    expect(source).not.toContain(
      'isCreatingCategory && !categoryAllocations.some((allocation) => allocation.category.trim().toLocaleLowerCase() === \'other\')',
    );
    expect(source).toContain(
      '{categoryAllocations.length > 0 && !(hasOtherCategorySelected && categoryAllocations.length === 1) && (',
    );
  });
});