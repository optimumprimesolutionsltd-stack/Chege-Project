import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as timing from '@/lib/updateTiming';
import { INSTALL_AFTER_AWAY_MS, forgetWhatsNew, keepWhatsNew, shouldInstallOnReturn, takeWhatsNew } from '@/lib/updateTiming';

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

// "I should be able to update from the pop up if I want, or press skip so it
// can update later... it's appearing for a flick of a second" (8 Oct 2026).
describe('a ready update asks first', () => {
  const layout = readFileSync('app/_layout.tsx', 'utf8');
  const prompt = readFileSync('components/UpdatePrompt.tsx', 'utf8');

  it('never restarts by itself at a fresh start; it offers Update now and Later', () => {
    expect('shouldInstallAtStart' in timing).toBe(false);
    expect(layout).toContain('setReadyNotes(notes);');
    expect(layout).toContain('<UpdatePrompt kind="ready" notes={readyNotes} onUpdate={updateNow} onDismiss={later} />');
    expect(prompt).toContain('testID="update-now"');
    expect(prompt).toContain('testID="update-later"');
  });

  it('only its buttons close it - a tap on the dimmed screen does not', () => {
    expect(prompt).not.toContain('onPress={dismiss} />');
    expect(prompt).toContain('<Pressable style={StyleSheet.absoluteFill} accessible={false} />');
  });

  it('Update now does not list what is new a second time', async () => {
    const storage = memory();
    await keepWhatsNew('update-3', ['Debt payments'], storage);
    await forgetWhatsNew(storage);
    expect(await takeWhatsNew('update-3', storage)).toBeNull();
  });
});
