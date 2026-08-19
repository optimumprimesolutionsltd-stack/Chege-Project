import { describe, expect, it } from 'vitest';
import { buildCascadePreview, parseWholeKesAmount } from '../cascadePreview';

const goals = [
  { id: 1, name: 'Emergency fund', targetAmount: 1_000, currentAmount: 800 },
  { id: 2, name: 'School fees', targetAmount: 2_000, currentAmount: 500 },
  { id: 3, name: 'Holiday', targetAmount: 500, currentAmount: 500 },
];

describe('buildCascadePreview', () => {
  it('fills goals in the selected order without overfunding them', () => {
    expect(buildCascadePreview(700, goals)).toEqual({
      allocations: [
        { goalId: 1, goalName: 'Emergency fund', allocated: 200, newTotal: 1_000, completed: true },
        { goalId: 2, goalName: 'School fees', allocated: 500, newTotal: 1_000, completed: false },
      ],
      leftover: 0,
    });
  });

  it('keeps unallocated money visible when every goal is funded', () => {
    expect(buildCascadePreview(2_000, goals)).toEqual({
      allocations: [
        { goalId: 1, goalName: 'Emergency fund', allocated: 200, newTotal: 1_000, completed: true },
        { goalId: 2, goalName: 'School fees', allocated: 1_500, newTotal: 2_000, completed: true },
      ],
      leftover: 300,
    });
  });

  it('does not create a preview for invalid amounts', () => {
    expect(buildCascadePreview(99.5, goals)).toEqual({ allocations: [], leftover: 0 });
  });

  it('uses an explicit whole-KES format instead of interpreting pasted scientific notation', () => {
    expect(parseWholeKesAmount('1,000')).toBe(1_000);
    expect(parseWholeKesAmount('1000')).toBe(1_000);
    expect(parseWholeKesAmount('1e3')).toBeNull();
    expect(parseWholeKesAmount('1000.50')).toBeNull();
  });
});