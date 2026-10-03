import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { importSaveStalled, SAVE_STALLED_MS, setImportProgress } from '@/lib/importProgress';
import { retrySave, withTimeLimit } from '@/lib/saveRetry';

// Reported 3 Oct 2026: saved, left the import before it finished, came back -
// "Still saving" with no progress anywhere on the screen.
describe('a save running in the background', () => {
  afterEach(() => { vi.useRealTimers(); setImportProgress(null); });

  it('can tell a slow save from one that has stopped', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 3, 12, 0, 0));
    setImportProgress({ stage: 'saving', done: 45, total: 180 });
    expect(importSaveStalled()).toBe(false);
    vi.setSystemTime(Date.now() + SAVE_STALLED_MS);
    expect(importSaveStalled()).toBe(true);
    setImportProgress({ stage: 'saving', done: 46, total: 180 });
    expect(importSaveStalled()).toBe(false);
    setImportProgress({ stage: 'done', saved: 180, repeats: 0, failed: 0 });
    vi.setSystemTime(Date.now() + SAVE_STALLED_MS * 2);
    expect(importSaveStalled()).toBe(false);
  });

  it('gives up on a request the server never answers, and tries it again', async () => {
    await expect(withTimeLimit(new Promise(() => {}), 10)).rejects.toThrow('No answer from the server in time.');
    let calls = 0;
    const task = () => { calls += 1; return calls === 1 ? new Promise<number>(() => {}) : Promise.resolve(7); };
    await expect(retrySave(task, { pause: async () => {}, timeLimitMs: 10 })).resolves.toBe(7);
    expect(calls).toBe(2);
  });

  it('shows the progress on the import screen and in the Still saving message', () => {
    const screen = readFileSync('app/mpesa-import.tsx', 'utf8');
    expect(screen).toContain("const backgroundSave = !saving && liveProgress?.stage === 'saving' ? liveProgress : null;");
    expect(screen).toContain('testID="mpesa-background-save"');
    expect(screen).toContain('Saving… {backgroundSave.done} of {backgroundSave.total}');
    expect(screen).toContain('Your earlier save is still going: ${running.done} of ${running.total} done.');
    expect(screen).toContain("{ text: 'Save the rest now'");
  });
});
