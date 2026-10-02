import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isLapsedRefusal, lapsedSaveMessage } from '@/lib/lapsedSave';

// Reported 2 Oct 2026: an import into a group after the trial ended listed
// "Victor Kogi: HTTP 402 : Your Jamvi subscription has lapsed…" under every
// entry. It now stops at the first refusal and says it once, with a way to pay.
describe('a save refused because the trial or subscription ended', () => {
  it('is recognised by its status or by the message the client builds', () => {
    expect(isLapsedRefusal({ status: 402 })).toBe(true);
    expect(isLapsedRefusal(new Error('HTTP 402 Payment Required: Your Jamvi subscription has lapsed'))).toBe(true);
    expect(isLapsedRefusal(new Error('HTTP 500 : Server error'))).toBe(false);
    expect(isLapsedRefusal(new Error('Already recorded'))).toBe(false);
  });

  it('says which ended, that nothing is lost, and offers to pay - with no error code', () => {
    const trial = lapsedSaveMessage('trial', 9, true);
    expect(trial.title).toBe('Your free trial has ended');
    expect(trial.body).toContain('this group');
    expect(trial.body).toContain('Your 9 confirmed entries are kept here');
    expect(trial.body).not.toMatch(/402|HTTP/);
    expect(trial.action).toBe('Pay to continue');
    expect(lapsedSaveMessage('expired', 1, false).title).toBe('Your Jamvi subscription has ended');
    expect(lapsedSaveMessage('expired', 1, false).body).toContain('Your 1 confirmed entry is kept');
  });

  it('stops the phone import at the first refusal and sends people to pay', () => {
    const screen = readFileSync('app/mpesa-import.tsx', 'utf8');
    expect(screen).toContain('if (lapsed) return;');
    expect(screen).toMatch(/if \(isLapsedRefusal\(error\)\) \{\s+lapsed = true;\s+return;/);
    expect(screen).toContain("onPress={() => router.push('/subscription')}");
    expect(screen).toContain('{lastSave?.lapsed ? lapsedCard(confirmedCount) : null}');
    expect(screen).toContain('{outcome.lapsed ? lapsedCard(outcome.lapsed.waiting) : null}');
  });

  it('does the same on the web import', () => {
    const web = readFileSync('../family-budget/src/pages/mpesa-import.tsx', 'utf8');
    expect(web).toContain('if (lapsed) return;');
    expect(web).toContain('href="/subscription"');
    expect(web).toContain('{lastSave?.lapsed ? lapsedCard(confirmedCount) : null}');
  });
});
