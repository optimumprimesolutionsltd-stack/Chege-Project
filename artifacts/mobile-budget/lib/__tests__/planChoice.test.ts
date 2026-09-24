import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planChoiceKey, readPlanChoice, recordPlanChoice, shouldShowPlanChoice } from '../planChoice';
import type { MemberEntitlements } from '../subscription-status';

const ent = (over: Partial<MemberEntitlements>): MemberEntitlements => ({
  packageCode: null, packageName: 'Jamvi', fullAccess: true, status: 'trial',
  billingInterval: null, trialEndsAt: null, currentPeriodEnd: null, ...over,
});

function memory() {
  const map = new Map<string, string>();
  return {
    getItem: async (k: string) => map.get(k) ?? null,
    setItem: async (k: string, v: string) => { map.set(k, v); },
  };
}

describe('the compulsory plan screen', () => {
  it('stops somebody on trial who has not chosen', () => {
    expect(shouldShowPlanChoice(ent({}), null)).toBe(true);
  });
  it('never stops someone who already chose, is paying, or has lapsed', () => {
    expect(shouldShowPlanChoice(ent({}), 'trial')).toBe(false);
    expect(shouldShowPlanChoice(ent({ status: 'active' }), null)).toBe(false);
    expect(shouldShowPlanChoice(ent({ fullAccess: false, status: 'expired' }), null)).toBe(false);
    expect(shouldShowPlanChoice(undefined, null)).toBe(false);
  });
  it('remembers the choice per account', async () => {
    const storage = memory();
    expect(await readPlanChoice('u1', storage)).toBeNull();
    await recordPlanChoice('u1', 'pay', storage);
    expect(await readPlanChoice('u1', storage)).toBe('pay');
    expect(await readPlanChoice('u2', storage)).toBeNull();
    expect(planChoiceKey('u1')).not.toBe(planChoiceKey('u2'));
  });
  it('is registered without a back gesture and wired from the root layout', () => {
    const layout = readFileSync('app/_layout.tsx', 'utf8');
    expect(layout).toContain('<Stack.Screen name="plan-choice" options={{ gestureEnabled: false }} />');
    expect(layout).toContain("router.replace('/plan-choice')");
  });
});
