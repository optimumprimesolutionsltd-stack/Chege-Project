import { describe, expect, it } from 'vitest';
import { bannerLine, type MemberEntitlements } from '../subscription-status';

const NOW = new Date('2026-09-11T00:00:00.000Z');

function trialEntitlements(daysLeft: number): MemberEntitlements {
  const trialEndsAt = new Date(NOW.getTime() + daysLeft * 86_400_000).toISOString();
  return {
    packageCode: 'JAMVI',
    packageName: 'Jamvi',
    fullAccess: true,
    status: 'trial',
    billingInterval: 'monthly',
    trialEndsAt,
    currentPeriodEnd: null,
  };
}

describe('bannerLine', () => {
  it('is null with no entitlements yet', () => {
    expect(bannerLine(undefined, NOW)).toBeNull();
  });

  it('shows from the start of a 14-day trial, not just its last week', () => {
    const line = bannerLine(trialEntitlements(14), NOW);
    expect(line).not.toBeNull();
    expect(line!.tone).toBe('info');
    expect(line!.text).toContain('14 days left');
  });

  it('switches to the more urgent wording inside the last 7 days', () => {
    const line = bannerLine(trialEntitlements(3), NOW);
    expect(line!.text).toBe('3 days left in your free period. Tap to subscribe.');
  });

  it('reads "ends today" once the trial is on its last day', () => {
    const line = bannerLine(trialEntitlements(0), NOW);
    expect(line!.text).toBe('Your free period ends today. Tap to subscribe.');
  });

  it('warns on a lapsed subscription regardless of trial dates', () => {
    const line = bannerLine({
      packageCode: null,
      packageName: 'Jamvi',
      fullAccess: false,
      status: 'expired',
      billingInterval: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
    }, NOW);
    expect(line!.tone).toBe('warn');
    expect(line!.text).toContain('read-only');
  });

  it('warns on a missed payment', () => {
    const line = bannerLine({
      packageCode: 'JAMVI',
      packageName: 'Jamvi',
      fullAccess: true,
      status: 'past_due',
      billingInterval: 'monthly',
      trialEndsAt: null,
      currentPeriodEnd: null,
    }, NOW);
    expect(line!.tone).toBe('warn');
    expect(line!.text).toContain('Tap to pay');
  });

  it('is silent once fully subscribed', () => {
    const line = bannerLine({
      packageCode: 'JAMVI',
      packageName: 'Jamvi',
      fullAccess: true,
      status: 'active',
      billingInterval: 'monthly',
      trialEndsAt: null,
      currentPeriodEnd: new Date(NOW.getTime() + 20 * 86_400_000).toISOString(),
    }, NOW);
    expect(line).toBeNull();
  });
});
