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
    expect(layout).toContain("if (state === 'active') void check();");
  });

  it('lets go of the listener when the layout goes away', () => {
    expect(layout).toContain('return () => subscription.remove();');
  });

  it('still asks on the first load', () => {
    expect(layout).toContain('void check();\n\n    //');
  });
});

describe('without asking Expo on every app switch', () => {
  it('leaves a gap between checks', () => {
    // A quick switch to WhatsApp and back should not trigger a check.
    expect(layout).toContain('const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;');
    expect(layout).toContain('if (now - lastCheckedAt.current < UPDATE_CHECK_INTERVAL_MS) return;');
  });

  it('does not ask again while the prompt is already up', () => {
    expect(layout).toContain('if (showing.current) return;');
  });

  it('reads the prompt state through a ref, not a dependency', () => {
    // As a dependency it would tear down and re-subscribe the listener every
    // time the message changed.
    expect(layout).toContain('showing.current = updateMessage !== null;');
    expect(layout).toContain('}, [check]);');
  });

  it('stays out of the way in development', () => {
    expect(layout).toContain('if (__DEV__ || !Updates.isEnabled) return;');
  });
});
