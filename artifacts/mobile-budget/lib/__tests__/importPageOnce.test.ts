import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const screen = readFileSync('app/mpesa-import.tsx', 'utf8').replace(/\r\n/g, '\n');

// "the statement opened but i think it took ten minutes. the arrows are still
// not working" (10 Oct 2026): the server saw the same messages read twice at once.
describe('the import page opens once and reads once', () => {
  it('reads the messages one time, however many ways ask it to', () => {
    expect(screen).toContain('if (readingSmsRef.current) return null;');
    expect(screen).toContain('readingSmsRef.current = true;');
    expect(screen).toContain('readingSmsRef.current = false;');
  });

  it('closes an older copy of itself, so Back goes somewhere else', () => {
    expect(screen).toContain('state.routes.some((route) => route.name === mine.name && route.key !== mine.key)');
    expect(screen).toContain("navigation.dispatch({ type: 'RESET', payload: { ...state, routes, index: routes.length - 1 } } as never);");
  });

  it('draws 25 lines at a time', () => {
    expect(screen).toContain('const LINES_PER_PAGE = 25;');
  });
});
