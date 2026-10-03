import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deletedLabel, UNDO_DELETE_MS } from '@/lib/undoDelete';

// Asked for 3 Oct 2026: undo for bank entries, expenses and budgets, "in case
// someone pressed by mistake".
describe('Deleted - Undo', () => {
  it('waits a few seconds and names what went', () => {
    expect(UNDO_DELETE_MS).toBe(8_000);
    expect(deletedLabel('Naivas', 1200)).toBe('Naivas (KES 1,200)');
    expect(deletedLabel('', null)).toBe('entry');
    expect(deletedLabel('A very long description that goes on and on')).toHaveLength(28);
  });

  it('holds the delete back, cancels it on Undo, and sends it on leaving', () => {
    const bar = readFileSync('components/UndoDeleteBar.tsx', 'utf8');
    expect(bar).toContain('const timer = setTimeout(() => send(key), UNDO_DELETE_MS);');
    expect(bar).toContain("if (state !== 'active') for (const entry of [...pending.current]) send(entry.key);");
    const web = readFileSync('../family-budget/src/hooks/use-undoable-delete.tsx', 'utf8');
    expect(web).toContain('<ToastAction altText={`Undo deleting ${label}`} onClick={() => undo(key)}');
    expect(web).toContain('window.addEventListener("pagehide", flush);');
  });

  it('is on the bank, expenses and budget screens, phone and web', () => {
    const screens: Array<[string, string]> = [
      ['app/(tabs)/bank.tsx', 'undoable.schedule(`tx:${tx.id}`'],
      ['app/(tabs)/history.tsx', 'undoable.schedule(`exp:${exp.id}`'],
      ['app/(tabs)/budget.tsx', 'undoable.schedule(`cat:${cat.name}`'],
      ['../family-budget/src/pages/bank.tsx', 'undoable.schedule(`tx:${tx.id}`'],
      ['../family-budget/src/pages/expenses.tsx', 'undoable.schedule(`exp:${id}`'],
      ['../family-budget/src/pages/budget.tsx', 'undoable.schedule(`cat:${target.name}`'],
    ];
    for (const [path, call] of screens) expect(readFileSync(path, 'utf8')).toContain(call);
    for (const path of ['app/(tabs)/bank.tsx', 'app/(tabs)/history.tsx', 'app/(tabs)/budget.tsx']) {
      expect(readFileSync(path, 'utf8')).toContain('<UndoDeleteBar pending={undoable.pending} onUndo={undoable.undo} />');
    }
  });
});
