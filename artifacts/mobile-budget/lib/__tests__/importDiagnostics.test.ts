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
