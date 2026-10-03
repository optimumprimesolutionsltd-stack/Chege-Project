import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => { store.set(key, value); },
    removeItem: async (key: string) => { store.delete(key); },
  },
}));

import { clearSavePending, hasPendingSave, markSavePending, PENDING_SAVE_MAX_AGE_MS } from '@/lib/importSaveJob';

beforeEach(() => store.clear());

// "It doesn't save in the background as requested. If I exit and go back before
// finishing I have to redo."
describe('a save cut short is remembered for its workspace', () => {
  it('is pending from the start until it finishes', async () => {
    await markSavePending(3);
    expect(await hasPendingSave(3)).toBe(true);
    expect(await hasPendingSave(4)).toBe(false);
    await clearSavePending(3);
    expect(await hasPendingSave(3)).toBe(false);
  });

  it('is not resumed by itself once it is old', async () => {
    await markSavePending(3);
    expect(await hasPendingSave(3, Date.now() + PENDING_SAVE_MAX_AGE_MS + 1)).toBe(false);
  });
});

describe('the import screen finishes or waits for an earlier save', () => {
  const screen = readFileSync('app/mpesa-import.tsx', 'utf8');

  it('marks a save pending as it starts and clears it when it ends', () => {
    expect(screen).toContain('void markSavePending(savingFor);');
    expect(screen).toContain('void clearSavePending(savingFor);');
  });

  it('carries on a save that was cut short, skipping what already saved', () => {
    expect(screen).toContain('} else if (await hasPendingSave(group?.id)) {');
    expect(screen).toContain('if (!lines.some((item) => isConfirmedToSave(item, choices[item.index]))) {');
  });

  it('shows a save still running instead of starting a second one', () => {
    expect(screen).toContain('testID="mpesa-save-still-running"');
    // Now with how far it has got (backgroundSave.test.ts).
    expect(screen).toContain("Alert.alert('Still saving', `Your earlier save is still going: ${running.done} of ${running.total} done.");
  });
});
