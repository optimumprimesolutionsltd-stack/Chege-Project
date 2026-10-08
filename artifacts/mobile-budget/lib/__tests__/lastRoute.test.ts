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
