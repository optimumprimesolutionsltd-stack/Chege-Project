import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const hook = readFileSync('lib/importDiagnostics.ts', 'utf8');
const screen = readFileSync('app/mpesa-import.tsx', 'utf8');

// "its the whole page that is unresponsive" (10 Oct 2026): the page reports
// what it is doing, through the health check's log, with counts only.
describe('Import M-Pesa says what it is doing', () => {
  it('sends counts and timings only, through the health check, for a minute at most', () => {
    expect(hook).toContain('/api/healthz?import=');
    expect(hook).toContain('const TICKS = 30;');
    expect(hook).toContain('draws${renders} slowest${Math.round(longest)}ms late${late}ms lines${count}');
  });

  it('notes the taps that should leave or choose a file', () => {
    expect(screen).toContain("diagnose('back tap');");
    expect(screen).toContain("diagnose('choose tap');");
    expect(screen).toContain("diagnose('phone back');");
  });
});

describe('footprints of the page opening, kept if it freezes', () => {
  const trace = readFileSync('lib/importTrace.ts', 'utf8');
  const layout = readFileSync('app/_layout.tsx', 'utf8');
  it('still sends any left by an older version at the next start, but the page no longer writes them', () => {
    expect(trace).toContain('/api/healthz?trace=');
    expect(layout).toContain('void sendLeftTrace();');
    // Each step was a file write - seconds over the first draws (10 Oct 2026).
    expect(screen).not.toContain('traceOpen();');
  });
});

describe('the steps after reading are timed, and a left page stops reading', () => {
  it('reports each step and the save getting ready, and stops a read when the page is left', () => {
    expect(screen).toContain("step('nicknames');");
    expect(screen).toContain("step('suggestions');");
    expect(screen).toContain("step('own-accounts');");
    expect(screen).toContain('diagnose(`step save-ready ${Date.now() - saveStartedAt}ms');
    expect(screen).toContain('useEffect(() => () => { aliveRef.current = false; }, []);');
    expect(screen).toContain('if (!aliveRef.current) return null;');
  });
});

describe('what a save did with each line is reported, in counts', () => {
  it('says the kinds of line and the outcome, with names and digits masked', () => {
    expect(screen).toContain('diagnose(`saved lines${lines.length} toSave${toSave.length} saved${result.saved} repeats${result.repeats} failed${result.failed.length}');
    expect(screen).toContain("failure.why.replace(");
    expect(screen).toContain(".replace(/\\d/g, '#').slice(0, 70)");
  });
});
