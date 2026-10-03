import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { withStep } from '@/hooks/useUndoHistory';

// Asked for 3 Oct 2026: "undo buttons ... in case someone pressed by mistake".
describe('undo in the M-Pesa import', () => {
  it('keeps the newest steps, oldest dropped first', () => {
    let stack: number[] = [];
    for (let step = 1; step <= 35; step += 1) stack = withStep(stack, step, 30);
    expect(stack.length).toBe(30);
    expect(stack[0]).toBe(6);
    expect(stack[29]).toBe(35);
  });

  it('is on both import screens beside Save, cleared for a new list or after a save', () => {
    for (const path of ['app/mpesa-import.tsx', '../family-budget/src/pages/mpesa-import.tsx']) {
      const screen = readFileSync(path, 'utf8');
      expect(screen).toContain('useUndoHistory(choices, setChoices, lines, {');
      expect(screen).toContain('mpesa-import-undo');
    }
    const web = readFileSync('../family-budget/src/hooks/use-undo-history.ts', 'utf8');
    expect(web).toContain('export function useUndoHistory');
  });

  it('never offers to remember Not sure yet as a payee\'s category', () => {
    for (const path of ['app/mpesa-import.tsx', '../family-budget/src/pages/mpesa-import.tsx']) {
      expect(readFileSync(path, 'utf8')).toContain('choice.category && !isNotSure(choice.category) && item.description && rules[payeeKey(item.description)]');
    }
  });
});
