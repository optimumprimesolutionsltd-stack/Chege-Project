import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// "0 of 0 ready to save", every message "Already recorded": Save cannot be
// pressed, so the mark that says which messages are new never moved and Home's
// badge counted the same messages for ever (4 Oct 2026).
describe('new M-Pesa messages that are all already recorded', () => {
  const screen = read('app/mpesa-import.tsx');
  const opened = screen.slice(screen.indexOf("if (params.fromSms !== 'new'"), screen.indexOf("if (params.fromSms !== 'new'") + 1200);

  it('move the mark on as soon as they are read, when none of them can be saved', () => {
    expect(opened).toContain('const shown = await readSmsMessages(found.messages);');
    expect(opened).toContain('if (shown && !shown.some(isRecordable)) {');
    expect(opened).toContain('await keepSmsAuto({ on: true, since: found.newest });');
    expect(opened).toContain("void queryClient.invalidateQueries({ queryKey: ['new-mpesa-sms'] });");
  });

  it('still leave the mark for Save to move when something can be saved', () => {
    expect(screen).toContain('if (smsNewestRef.current !== null && result.saved + result.repeats > 0) {');
  });

  it('hand back what was read, so the screen can tell', () => {
    expect(screen).toContain('const readSmsMessages = async (messages: string[]): Promise<PreviewLine[] | null> => {');
    expect(screen).toContain('return shown;');
  });
});

// Saved, but Home still said "9 new M-Pesa messages" until a refresh (5 Oct
// 2026): Home was asked to count again before the new mark was stored, so it
// read the old one back and counted the same messages.
describe('after a save, Home counts from the new mark', () => {
  const screen = read('app/mpesa-import.tsx');

  it('stores the mark before Home is asked to count again', () => {
    expect(screen).toContain('return AsyncStorage.setItem(autoKey, JSON.stringify(next)).catch(() => {});');
    const saved = screen.slice(screen.indexOf('if (smsNewestRef.current !== null && result.saved + result.repeats > 0) {'));
    const stored = saved.indexOf('await keepSmsAuto({ on: true, since: smsNewestRef.current });');
    expect(stored).toBeGreaterThan(-1);
    expect(stored).toBeLessThan(saved.indexOf("void queryClient.invalidateQueries({ queryKey: ['new-mpesa-sms'] });"));
  });
});
