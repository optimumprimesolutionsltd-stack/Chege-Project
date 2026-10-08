import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const layout = readFileSync('app/_layout.tsx', 'utf8');

// Published OTAs looked as though they had not shipped. They had — the app
// just never asked. The check ran once on mount, and nobody force-quits a
// phone app, so reopening a backgrounded Jamvi resumed the same JS context and
// re-ran nothing. Only a genuinely cold start ever showed the prompt.
describe('asking for updates more than once', () => {
  it('asks again whenever the app returns to the foreground', () => {
    expect(layout).toContain("AppState.addEventListener('change', (state) => {");
    expect(layout).toContain("if (state !== 'active') return;");
    const listener = layout.slice(layout.indexOf('AppState.addEventListener'));
    expect(listener).toContain('void check();');
  });

  it('lets go of the listener when the layout goes away', () => {
    expect(layout).toContain('return () => subscription.remove();');
  });

  it('still asks on the first load', () => {
    // Pinned by order rather than by surrounding whitespace — this file is
    // CRLF on disk, so an assertion spelling out '\n\n' matched nothing.
    const mountCheck = layout.indexOf('void check();');
    const subscribe = layout.indexOf('AppState.addEventListener');
    expect(mountCheck).toBeGreaterThan(-1);
    expect(mountCheck).toBeLessThan(subscribe);
  });
});

describe('without asking Expo on every app switch', () => {
  it('leaves a gap between checks', () => {
    // A quick switch to WhatsApp and back should not trigger a check.
    expect(layout).toContain('const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;');
    expect(layout).toContain('if (now - lastCheckedAt.current < UPDATE_CHECK_INTERVAL_MS) return;');
  });

  it('does not download again once an update is waiting, and stays out of the way in development', () => {
    expect(layout).toContain('if (__DEV__ || !Updates.isEnabled || downloaded.current) return;');
  });

  it('reads what it needs through refs, not dependencies', () => {
    // As a dependency it would tear down and re-subscribe the listener every
    // time the screen or a save changed.
    expect(layout).toContain('where.current = pathname;');
    expect(layout).toContain('}, [check]);');
  });
});

// "My issue the update removes me from my current session" (8 Oct 2026).
describe('never restarting in the middle of something', () => {
  it('downloads quietly and puts the update in on coming back after a while away', () => {
    expect(layout).toContain('const fetched = await Updates.fetchUpdateAsync();');
    expect(layout).toContain('if (shouldInstallOnReturn({ downloaded: downloaded.current, awayMs, saving: saving.current })) {');
  });

  it('says what is new once the update is in', () => {
    expect(layout).toContain('void takeWhatsNew(Updates.updateId, AsyncStorage)');
  });
});
