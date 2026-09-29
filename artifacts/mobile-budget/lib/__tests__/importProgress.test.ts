import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getImportProgress, importProgressText, setImportProgress } from '../importProgress';

// "Can I change tabs and do something else as it's importing?"
describe('the import saving bar', () => {
  it('says how far saving has got, then how it went', () => {
    expect(importProgressText({ stage: 'saving', done: 120, total: 237 })).toBe('Saving M-Pesa entries · 120 of 237');
    expect(importProgressText({ stage: 'done', saved: 230, repeats: 5, failed: 0 })).toBe('M-Pesa import done: 230 saved, 5 already recorded');
    expect(importProgressText({ stage: 'done', saved: 230, repeats: 0, failed: 2 })).toContain('2 not saved - import again to retry them');
  });

  it('is one shared state the import screen writes and the bar reads', () => {
    setImportProgress({ stage: 'saving', done: 1, total: 2 });
    expect(getImportProgress()).toEqual({ stage: 'saving', done: 1, total: 2 });
    setImportProgress(null);
    expect(getImportProgress()).toBeNull();
  });

  it('is shown on every screen but the import itself, and updated as each entry saves', () => {
    const bar = readFileSync('components/ImportSavingBar.tsx', 'utf8');
    const layout = readFileSync('app/_layout.tsx', 'utf8');
    const screen = readFileSync('app/mpesa-import.tsx', 'utf8');
    expect(bar).toContain("if (!progress || pathname === '/mpesa-import') return null;");
    expect(layout).toContain('<ImportSavingBar />');
    expect(screen).toContain("setImportProgress({ stage: 'saving', done: doneCount, total: toSave.length });");
    expect(screen).toContain("setImportProgress({ stage: 'done', saved: result.saved, repeats: result.repeats, failed: result.failed.length });");
  });
});
