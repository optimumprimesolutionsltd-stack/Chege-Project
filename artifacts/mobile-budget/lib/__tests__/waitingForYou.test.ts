import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo', () => ({ requireOptionalNativeModule: () => null }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' }, PermissionsAndroid: {} }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null } }));

import { waitingBadge } from '@/hooks/useWaitingForYou';

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
});
