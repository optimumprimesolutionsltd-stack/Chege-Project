import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { consumeResumePoint, isResumable, saveResumePoint } from '../resumeAfterUpdate';

function memory() {
  const map = new Map<string, string>();
  return {
    getItem: async (k: string) => map.get(k) ?? null,
    setItem: async (k: string, v: string) => { map.set(k, v); },
    removeItem: async (k: string) => { map.delete(k); },
    map,
  };
}

// Accepting an update restarts the app, which always begins on Home, so
// somebody on another screen lost their place. Reported as: "when i get a new
// update and i click everything else goes away and i come back to the home page".
describe('coming back to the same screen after an update restarts the app', () => {
  it('goes back to a screen worth returning to, once', async () => {
    const storage = memory();
    await saveResumePoint('/bank', storage, 1_000);
    expect(await consumeResumePoint(storage, 2_000)).toBe('/bank');
    expect(await consumeResumePoint(storage, 2_000)).toBeNull();
  });
  it('does not remember Home, sign-in, onboarding or form sheets', async () => {
    for (const path of ['/', '/login', '/budget-chooser', '/plan-choice', '/add-expense', undefined]) {
      expect(isResumable(path)).toBe(false);
    }
    const storage = memory();
    await saveResumePoint('/add-expense', storage);
    expect(storage.map.size).toBe(0);
  });
  it('forgets a note that is old, and always clears it', async () => {
    const storage = memory();
    await saveResumePoint('/budget', storage, 0);
    expect(await consumeResumePoint(storage, 6 * 60 * 1000)).toBeNull();
    expect(storage.map.size).toBe(0);
  });
  it('is saved before either restart and restored from the root layout', () => {
    const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
    expect(read('components/UpdatePrompt.tsx')).toContain('await saveResumePoint(pathname, AsyncStorage);\n      await Updates.reloadAsync();');
    expect(read('app/(tabs)/settings.tsx')).toContain("saveResumePoint('/settings', AsyncStorage).then(() => Updates.reloadAsync())");
    expect(read('app/_layout.tsx')).toContain('consumeResumePoint(AsyncStorage)');
  });
});
