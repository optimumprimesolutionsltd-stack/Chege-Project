import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { looksLikeMpesa, onSharedMessages, queueSharedMessages, takeSharedMessages } from '@/lib/sharedMessages';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// "Build the share button for Android": select messages, tap Share, choose Jamvi.
describe('shared messages waiting for the paste screen', () => {
  beforeEach(() => {
    takeSharedMessages();
  });

  it('holds what was shared and hands it over once', () => {
    queueSharedMessages('TESTA1 Confirmed. Ksh10.00 sent to X.');
    expect(takeSharedMessages()).toBe('TESTA1 Confirmed. Ksh10.00 sent to X.');
    expect(takeSharedMessages()).toBe('');
  });

  it('adds several shares up instead of replacing one with the next', () => {
    queueSharedMessages('first');
    queueSharedMessages('  second  ');
    expect(takeSharedMessages()).toBe('first\n\nsecond');
  });

  it('ignores blank shares', () => {
    queueSharedMessages('   ');
    expect(takeSharedMessages()).toBe('');
  });

  it('tells whoever is listening, until they stop', () => {
    const listener = vi.fn();
    const stop = onSharedMessages(listener);
    queueSharedMessages('one');
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    queueSharedMessages('two');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('what is worth opening the paste screen for', () => {
  it('accepts an M-Pesa confirmation', () => {
    expect(looksLikeMpesa('TESTSEND1 Confirmed. Ksh70.00 sent to SAMPLE on 2/9/26.')).toBe(true);
    expect(looksLikeMpesa('You have received KES 3,500 from A. New M-PESA balance is KES 3,500')).toBe(true);
  });
  it('ignores a link, a note, or a message with no amount', () => {
    expect(looksLikeMpesa('https://example.com/article')).toBe(false);
    expect(looksLikeMpesa('Remember to buy milk')).toBe(false);
    expect(looksLikeMpesa('M-PESA is down for maintenance')).toBe(false);
  });
});

describe('the Android share target is configured, and safe for builds that lack it', () => {
  const app = JSON.parse(read('app.json')).expo;
  const pkg = JSON.parse(read('package.json'));

  it('registers Jamvi as a text share target on Android only', () => {
    const plugin = app.plugins.find((entry: unknown) => Array.isArray(entry) && entry[0] === 'expo-share-intent');
    expect(plugin).toBeTruthy();
    expect(plugin[1]).toMatchObject({ disableIOS: true, androidIntentFilters: ['text/*'] });
  });

  it('uses the library version built for this Expo release', () => {
    expect(pkg.dependencies['expo-share-intent']).toBe('5.1.1');
    expect((pkg.devDependencies ?? pkg.dependencies).expo).toMatch(/54/);
  });

  it('raises the Android version code, and leaves the update runtime alone so old builds keep updating', () => {
    expect(app.android.versionCode).toBeGreaterThanOrEqual(2);
    expect(app.runtimeVersion).toEqual({ policy: 'appVersion' });
    expect(app.version).toBe('1.0.0');
  });

  it('loads the native module inside a try, so an old build does not crash on it', () => {
    const source = read('lib/shareIntent.ts');
    expect(source).toContain("if (Platform.OS === 'android') {\n  try {");
    expect(source).toContain("require('expo-share-intent')");
    expect(source).toContain('} catch {');
    expect(source).not.toMatch(/^import .* from 'expo-share-intent'/m);
  });

  it('opens the paste screen only when signed in, and only for M-Pesa messages', () => {
    const layout = read('app/_layout.tsx');
    expect(layout).toContain('const { text: sharedText, clear: clearSharedText } = useSharedText();');
    expect(layout).toContain('if (!sharedText || !isAuthenticated || checkingChooser) return;');
    expect(layout).toContain('if (!looksLikeMpesa(sharedText))');
    expect(layout).toContain("router.navigate('/mpesa-import');");
  });

  it('the paste screen reads shared messages at once, whether it opens for them or is already open', () => {
    const screen = read('app/mpesa-import.tsx');
    expect(screen).toContain('takeShared();');
    expect(screen).toContain('return onSharedMessages(takeShared);');
    expect(screen).toContain('void readRef.current(combined);');
  });

  it('only advertises the Share button on a build that has it', () => {
    const screen = read('app/mpesa-import.tsx');
    expect(screen).toContain('{canReceiveShares ? (');
    expect(screen).toContain('tap Share, and choose Jamvi');
  });
});
