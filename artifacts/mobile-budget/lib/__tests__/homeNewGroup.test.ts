import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mayStartGroup } from '@/lib/groupStart';

// Asked for 2 Oct 2026: start a group from Home, but only while active.
describe('starting a group from Home', () => {
  it('is offered only while the trial or subscription is active', () => {
    expect(mayStartGroup({ fullAccess: true, status: 'trial' })).toBe(true);
    expect(mayStartGroup({ fullAccess: true, status: 'active' })).toBe(true);
    // An account from before subscriptions, as the server treats it.
    expect(mayStartGroup({ fullAccess: false, status: null })).toBe(true);
    expect(mayStartGroup({ fullAccess: false, status: 'trial' })).toBe(false);
    expect(mayStartGroup({ fullAccess: false, status: 'expired' })).toBe(false);
    // Not known yet: nothing shown rather than a button that may be refused.
    expect(mayStartGroup(undefined)).toBe(false);
  });

  it('puts a New group shortcut on the phone Home that opens the create form', () => {
    const home = readFileSync('app/(tabs)/index.tsx', 'utf8');
    expect(home).toContain("route: '/(tabs)/settings?openCreateGroup=1'");
    expect(home).toContain('...(mayStartGroup(entitlements) ? [NEW_GROUP_SHORTCUT] : []),');
    const settings = readFileSync('app/(tabs)/settings.tsx', 'utf8');
    expect(settings).toContain("if (params.openCreateGroup !== '1') return;");
    expect(settings).toContain('onPress={openCreateGroup}');
    expect(settings).toContain("{ text: 'Subscribe', onPress: () => router.push('/subscription') }");
  });

  it('shows the web Home card only while active, reading the subscription one way', () => {
    const dashboard = readFileSync('../family-budget/src/pages/dashboard.tsx', 'utf8');
    expect(dashboard).toContain('if (isLoading || !mayStartGroup(entitlements)) return null;');
    const hook = readFileSync('../family-budget/src/hooks/use-entitlements.ts', 'utf8');
    expect(hook).toContain('(await response.json()).member as MemberEntitlements');
    const layout = readFileSync('../family-budget/src/components/layout.tsx', 'utf8');
    expect(layout).toContain('const { data: entitlements } = useEntitlements();');
    expect(layout).not.toContain('return response.json() as Promise<MemberEntitlements>;');
  });
});
