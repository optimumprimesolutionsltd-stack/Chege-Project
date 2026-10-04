import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { yearSummary } from '../deleteYear';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// "Delete 2025 for good, that is for me" (4 Oct 2026).
describe('deleting a past year', () => {
  it('says exactly what will go', () => {
    expect(yearSummary({ year: 2025, bankEntries: 1204, expenses: 37, contributions: 0 })).toBe('1,204 M-Pesa and bank entries and 37 expenses will be deleted.');
    expect(yearSummary({ year: 2025, bankEntries: 1, expenses: 0, contributions: 2 })).toBe('1 M-Pesa or bank entry and 2 contributions will be deleted.');
    expect(yearSummary({ year: 2025, bankEntries: 0, expenses: 0, contributions: 0 })).toBe('Nothing is recorded in it.');
  });

  const screen = read('app/delete-year.tsx');
  it('asks first, then deletes only with the emailed code, and refreshes everything', () => {
    expect(screen.indexOf('Alert.alert(\n      `Delete ${year.year} for good?`')).toBeGreaterThan(0);
    expect(screen).toContain("customFetch(`/api/budget-years/${year.year}/delete/request-code`, { method: 'POST' })");
    expect(screen).toContain('disabled={deleting || sending || code.length !== 6}');
    expect(screen).toContain('body: JSON.stringify({ code }),');
    expect(screen).toContain('await queryClient.resetQueries();');
  });

  it('is offered from Settings in a Personal budget, on its own screen with no swipe back', () => {
    const settings = read('app/(tabs)/settings.tsx');
    const privateBlock = settings.slice(settings.indexOf('{group?.isPrivate ? (\n            <View style={[styles.workspaceInfo'));
    expect(privateBlock.indexOf('testID="delete-past-year"')).toBeGreaterThan(0);
    expect(privateBlock.indexOf('testID="delete-past-year"')).toBeLessThan(privateBlock.indexOf(') : null}'));
    expect(read('app/_layout.tsx')).toContain('<Stack.Screen name="delete-year" options={{ headerShown: false, gestureEnabled: false }} />');
  });
});
