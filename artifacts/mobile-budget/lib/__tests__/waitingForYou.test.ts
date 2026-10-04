import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo', () => ({ requireOptionalNativeModule: () => null }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' }, PermissionsAndroid: {} }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null } }));

import { canActOnWaiting, waitingBadge, waitingDestination, waitingTotal } from '@/hooks/useWaitingForYou';

// "These two can easily be forgotten, yet they are the most important in the
// app" (3 Oct 2026): new M-Pesa messages and entries to sort out.
describe('what is waiting for you', () => {
  it('is a badge on the Home tab: a number, 99+ past that, nothing at none', () => {
    expect(waitingBadge(0)).toBeUndefined();
    expect(waitingBadge(78)).toBe('78');
    expect(waitingBadge(140)).toBe('99+');
    const layout = readFileSync('app/(tabs)/_layout.tsx', 'utf8');
    expect(layout).toContain('const homeBadge = waitingBadge(useWaitingForYou().total);');
    expect(layout).toContain('tabBarBadge: homeBadge,');
  });

  it('leads Home, above Your M-Pesa', () => {
    const home = readFileSync('app/(tabs)/index.tsx', 'utf8');
    const sms = home.indexOf('testID="new-mpesa-sms-cta"');
    const sort = home.indexOf('testID="entries-to-sort-cta"');
    const mpesa = home.indexOf('<MpesaImportCard />');
    expect(sms).toBeGreaterThan(0);
    expect(sort).toBeGreaterThan(sms);
    expect(mpesa).toBeGreaterThan(sort);
    expect(home).toContain('useWaitingForYou()');
  });

  it('counts only for somebody who is shown the cards, so the badge always has something behind it', () => {
    expect(canActOnWaiting({ isPrivate: true, role: 'owner' })).toBe(true);
    expect(canActOnWaiting({ isPrivate: false, role: 'owner' })).toBe(true);
    expect(canActOnWaiting({ isPrivate: false, role: 'admin' })).toBe(true);
    expect(canActOnWaiting({ isPrivate: false, role: 'member' })).toBe(false);
    expect(canActOnWaiting({ isPrivate: false, role: 'viewer' })).toBe(false);
    expect(canActOnWaiting(undefined)).toBe(false);
    expect(waitingTotal({ toSortCount: 4, newSmsCount: 5, canAct: true })).toBe(9);
    expect(waitingTotal({ toSortCount: 4, newSmsCount: 5, canAct: false })).toBe(0);
    // The same rule as the cards on Home.
    const home = readFileSync('app/(tabs)/index.tsx', 'utf8');
    expect(home).toContain("const canManageBudget = !isSharedWorkspace || group?.role === 'owner' || group?.role === 'admin';");
  });

  it('tapping Home again, once Home is open, goes straight to the thing to fix', () => {
    expect(waitingDestination({ toSortCount: 4, newSmsCount: 5, canAct: true })).toBe('/mpesa-import?fromSms=new');
    expect(waitingDestination({ toSortCount: 4, newSmsCount: 0, canAct: true })).toBe('/sort-entries');
    expect(waitingDestination({ toSortCount: 0, newSmsCount: 0, canAct: true })).toBeNull();
    expect(waitingDestination({ toSortCount: 4, newSmsCount: 5, canAct: false })).toBeNull();
    const home = readFileSync('app/(tabs)/index.tsx', 'utf8').replace(/\r\n/g, '\n');
    expect(home).toContain("navigation.addListener('tabPress' as never, () => {");
    expect(home).toContain('if (!navigation.isFocused()) return;');
    expect(home).toContain('if (destination) router.push(destination as never);');
    expect(home).toContain('else homeScrollRef.current?.scrollTo({ y: 0, animated: true });');
    // The same screens the cards open.
    expect(home).toContain("router.push('/mpesa-import?fromSms=new' as never)");
    expect(home).toContain("router.push('/sort-entries' as never)");
  });
});
