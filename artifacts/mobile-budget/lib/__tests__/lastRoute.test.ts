import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { cameBackFromOnTop, notePath, resetRouteHistoryForTests } from '@/lib/lastRoute';

// "In banking if i press the not sure button and then go back, it takes me off what i was doing" (8 Oct 2026).
describe('a screen keeps its place when you come back to it', () => {
  beforeEach(() => resetRouteHistoryForTests());

  it('coming back from a screen opened on top keeps the place', () => {
    notePath('/bank');
    notePath('/sort-entries');
    notePath('/bank');
    expect(cameBackFromOnTop()).toBe(true);
  });

  it('arriving from another tab starts at the top', () => {
    notePath('/bank');
    notePath('/reports');
    expect(cameBackFromOnTop()).toBe(false);
  });

  it('the first screen starts at the top, and a repeated path changes nothing', () => {
    notePath('/');
    notePath('/');
    expect(cameBackFromOnTop()).toBe(false);
  });

  it('both page lists skip the reset when coming back, and the root layout records the path', () => {
    expect(readFileSync('components/PageScrollReset.tsx', 'utf8').match(/if \(cameBackFromOnTop\(\)\) return;/g)).toHaveLength(2);
    expect(readFileSync('app/_layout.tsx', 'utf8')).toContain('notePath(pathname);');
  });
});

describe('handed back after an edit opened elsewhere', () => {
  it('Activity keeps its place when Bank sends you back to it, once', async () => {
    const { markReturning } = await import('@/lib/lastRoute');
    resetRouteHistoryForTests();
    notePath('/history');
    notePath('/bank');
    markReturning('/(tabs)/history');
    notePath('/history');
    expect(cameBackFromOnTop()).toBe(true);
    notePath('/reports');
    notePath('/history');
    expect(cameBackFromOnTop()).toBe(false);
  });
});

// "When i press go back in the app, it should take me to what i was doing previously" (8 Oct 2026).
describe('Back retraces the tabs you visited', () => {
  it('goes to the tab before, keeps its place, and keeps going back', async () => {
    const { backTarget } = await import('@/lib/lastRoute');
    resetRouteHistoryForTests();
    notePath('/');
    notePath('/history');
    notePath('/sort-entries'); // a screen on top is not a step on the tab trail
    notePath('/history');
    notePath('/bank');
    expect(backTarget()).toBe('/(tabs)/history');
    notePath('/history');
    expect(cameBackFromOnTop()).toBe(true);
    expect(backTarget()).toBe('/(tabs)');
    notePath('/');
    expect(backTarget()).toBeNull();
  });

  it('says where to go back to even after a long day of switching', async () => {
    const { backTarget } = await import('@/lib/lastRoute');
    resetRouteHistoryForTests();
    for (let i = 0; i < 50; i += 1) { notePath('/bank'); notePath('/reports'); }
    expect(backTarget()).toBe('/(tabs)/bank');
  });

  it('Android and browser Back both use it', async () => {
    const { readFileSync } = await import('node:fs');
    const layout = readFileSync('app/_layout.tsx', 'utf8');
    expect(layout.match(/const target = backTarget\(\);/g)).toHaveLength(2);
    expect(layout).not.toContain("router.replace('/(tabs)');");
  });
});
