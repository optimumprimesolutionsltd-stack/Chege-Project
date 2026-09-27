import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/mpesa-import.tsx', 'utf8');

// Reported: typing in the category search hid the results under the
// keyboard. The sheet is a bottom-anchored Modal with no keyboard avoidance,
// so the results list stayed put while the keyboard rose over it.
describe('sheets with a text input shift above the keyboard', () => {
  it('imports what it needs', () => {
    expect(source).toContain('KeyboardAvoidingView');
    expect(source).toContain('Platform,');
  });

  it('wraps the category search sheet', () => {
    const opensAt = source.indexOf('>What was it for?<');
    const wrapAt = source.lastIndexOf('KeyboardAvoidingView', opensAt);
    expect(opensAt).toBeGreaterThan(-1);
    expect(wrapAt).toBeGreaterThan(-1);
    expect(opensAt - wrapAt).toBeLessThan(400);
  });

  it('wraps the nickname sheet', () => {
    const opensAt = source.indexOf('>What do you call this?<');
    const wrapAt = source.lastIndexOf('KeyboardAvoidingView', opensAt);
    expect(opensAt).toBeGreaterThan(-1);
    expect(wrapAt).toBeGreaterThan(-1);
    expect(opensAt - wrapAt).toBeLessThan(400);
  });

  it('wraps the report-a-message sheet', () => {
    const opensAt = source.indexOf('>Send this message<');
    const wrapAt = source.lastIndexOf('KeyboardAvoidingView', opensAt);
    expect(opensAt).toBeGreaterThan(-1);
    expect(wrapAt).toBeGreaterThan(-1);
    expect(opensAt - wrapAt).toBeLessThan(400);
  });
});
