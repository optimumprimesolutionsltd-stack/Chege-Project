import { describe, expect, it } from 'vitest';
import { INSTALL_AFTER_AWAY_MS, keepWhatsNew, shouldInstallOnReturn, takeWhatsNew } from '@/lib/updateTiming';

const memory = () => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (key: string) => map.get(key) ?? null,
    setItem: async (key: string, value: string) => { map.set(key, value); },
    removeItem: async (key: string) => { map.delete(key); },
  };
};

// "My issue the update removes me from my current session" (8 Oct 2026).
describe('an update goes in at a natural break', () => {
  it('only after coming back from a while away, with nothing saving', () => {
    expect(shouldInstallOnReturn({ downloaded: true, awayMs: INSTALL_AFTER_AWAY_MS, saving: false })).toBe(true);
    expect(shouldInstallOnReturn({ downloaded: true, awayMs: 30_000, saving: false })).toBe(false);
    expect(shouldInstallOnReturn({ downloaded: true, awayMs: null, saving: false })).toBe(false);
    expect(shouldInstallOnReturn({ downloaded: true, awayMs: INSTALL_AFTER_AWAY_MS * 2, saving: true })).toBe(false);
    expect(shouldInstallOnReturn({ downloaded: false, awayMs: INSTALL_AFTER_AWAY_MS * 2, saving: false })).toBe(false);
  });

  it("says what is new once, when that update is the one running", async () => {
    const storage = memory();
    await keepWhatsNew('update-2', ['Edit on Activity'], storage);
    expect(await takeWhatsNew('update-1', storage)).toBeNull();
    expect(await takeWhatsNew('update-2', storage)).toEqual(['Edit on Activity']);
    expect(await takeWhatsNew('update-2', storage)).toBeNull();
  });
});
