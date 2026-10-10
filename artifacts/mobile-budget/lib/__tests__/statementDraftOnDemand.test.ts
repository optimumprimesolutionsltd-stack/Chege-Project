import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const draft = readFileSync('lib/draft.ts', 'utf8').replace(/\r\n/g, '\n');
const screen = readFileSync('app/mpesa-import.tsx', 'utf8');

// Import M-Pesa held still for ~30 s on every open: it restored and reworked
// an unfinished 2,512-entry statement before a tap could land, and turned the
// whole review (1.1 MB) into text on every draw (10 Oct 2026).
describe('an unfinished statement waits to be asked for', () => {
  it('is not loaded as the page opens; Continue brings it back, Start over lets it go', () => {
    expect(screen).toContain('manual: true,');
    expect(screen).toContain('testID="mpesa-statement-waiting"');
    expect(screen).toContain('onPress={resumeStatement}');
    expect(screen).toContain('onPress: discardStatementDraft');
  });

  it('keeps a waiting draft until resumed, discarded or replaced by new work', () => {
    expect(draft).toContain('if (manual) {\n          setWaiting(saved);\n          return;\n        }');
    expect(draft).toContain('if (!active) return;\n      setWaiting(null);');
  });

  it('is written once things are quiet, and only when it changed - never turned into text on every draw', () => {
    expect(draft).not.toContain('const serialized = JSON.stringify(value);');
    expect(draft).toContain('const serialized = JSON.stringify(valueRef.current);');
    expect(draft).toContain('if (serialized === lastWritten.current) return;');
  });
});
