import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canKeepScreenAwake, keepScreenAwakeWhileSaving, letScreenSleepAgain } from '@/lib/keepAwake';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// From "does the app keep working behind the scenes?": it does not, reliably, if the phone
// locks mid-save — nothing was telling the OS to keep the screen on. This is that.
describe('keeping the screen on while a statement saves', () => {
  it('is safe on a build without the native module: nothing throws, either function', async () => {
    // expo-keep-awake is not installed as a real dependency of this test run's fake native
    // layer, so this exercises exactly the guarded, OTA-safe path an older build takes.
    await expect(keepScreenAwakeWhileSaving()).resolves.toBeUndefined();
    expect(() => letScreenSleepAgain()).not.toThrow();
    expect(typeof canKeepScreenAwake).toBe('boolean');
  });

  it('loads the native module inside a try, the same pattern as the statement reader', () => {
    const source = read('lib/keepAwake.ts');
    expect(source).toContain("require('expo-keep-awake')");
    expect(source.indexOf('try {')).toBeLessThan(source.indexOf("require('expo-keep-awake')"));
  });

  it('is asked for right when saving starts, and released whether saving worked or not', () => {
    const screen = read('app/mpesa-import.tsx');
    expect(screen).toContain('setSaving(true);\n    void keepScreenAwakeWhileSaving();');
    expect(screen).toContain('setSaving(false);\n      letScreenSleepAgain();');
  });
});
