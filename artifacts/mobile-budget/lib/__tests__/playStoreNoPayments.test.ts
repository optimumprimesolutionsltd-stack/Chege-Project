import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bannerLine, type MemberEntitlements } from '@/lib/subscription-status';
import { paymentsAllowedOn, PLAY_CHANNEL, withoutPayPrompt } from '@/lib/playStore';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// "Play version has no payment screen; people pay on jamvi.co.ke" (15 Oct 2026).
describe('the Google Play build takes no payment', () => {
  it('is told apart by its update channel only', () => {
    expect(paymentsAllowedOn(PLAY_CHANNEL)).toBe(false);
    expect(paymentsAllowedOn('production')).toBe(true);
    expect(paymentsAllowedOn('preview')).toBe(true);
    expect(paymentsAllowedOn(null)).toBe(true);
    expect(paymentsAllowedOn(undefined)).toBe(true);
  });

  it('builds the Play bundle on the play channel', () => {
    const eas = JSON.parse(read('eas.json'));
    expect(eas.build.play.channel).toBe(PLAY_CHANNEL);
    expect(eas.build.play.android.buildType).toBe('app-bundle');
    for (const profile of ['preview', 'website', 'production']) expect(eas.build[profile].channel).not.toBe(PLAY_CHANNEL);
  });

  it('drops "Tap to subscribe" / "Tap to pay" from the banner but keeps what it says', () => {
    const now = new Date('2026-10-15T09:00:00Z');
    const trial = (days: number) =>
      ({ fullAccess: true, status: 'trial', trialEndsAt: new Date(now.getTime() + days * 86_400_000).toISOString() }) as unknown as MemberEntitlements;
    const lines = [
      bannerLine(trial(3), now)!.text,
      bannerLine(trial(0.2), now)!.text,
      bannerLine({ fullAccess: true, status: 'past_due' } as unknown as MemberEntitlements, now)!.text,
    ];
    for (const line of lines) {
      expect(line).toMatch(/Tap to (subscribe|pay)\.$/);
      expect(withoutPayPrompt(line)).not.toMatch(/Tap to/);
      expect(withoutPayPrompt(line).length).toBeGreaterThan(10);
    }
    expect(withoutPayPrompt("You're on a free trial — 20 days left. Tap to see what's included.")).toMatch(/Tap to see/);
  });

  it('guards every way into paying', () => {
    const guarded: Record<string, number> = {
      'app/subscription.tsx': 2,
      'app/plan-choice.tsx': 2,
      'app/budget-chooser.tsx': 1,
      'app/mpesa-import.tsx': 1,
      'app/budget-handover.tsx': 1,
      'app/(tabs)/settings.tsx': 2,
      'lib/lapsedError.ts': 1,
      'components/SubscriptionBanner.tsx': 1,
    };
    for (const [file, uses] of Object.entries(guarded)) {
      const source = read(file);
      expect((source.match(/IN_APP_PAYMENTS\s*\?/g) ?? []).length, file).toBe(uses);
    }
    // Every "Subscribe" alert button sits behind the switch.
    for (const file of ['app/(tabs)/settings.tsx', 'app/budget-handover.tsx', 'lib/lapsedError.ts']) {
      for (const line of read(file).split('\n').filter((l) => l.includes("text: 'Subscribe'"))) {
        expect(line, file).toMatch(/IN_APP_PAYMENTS|^\s*\? \[/);
      }
    }
  });

  it('the status-only screen keeps the M-Pesa form out of the Play build', () => {
    const screen = read('app/subscription.tsx');
    const guard = screen.indexOf('{IN_APP_PAYMENTS ? <View');
    expect(guard).toBeGreaterThan(-1);
    expect(screen.indexOf('M-Pesa number')).toBeGreaterThan(guard);
    expect(screen.indexOf('</View> : null}')).toBeGreaterThan(screen.indexOf('M-Pesa number'));
  });
});
