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
    expect(opened).toContain('keepSmsAuto({ on: true, since: found.newest });');
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
