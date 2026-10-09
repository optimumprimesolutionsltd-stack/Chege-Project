import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// "Looks like this problem is common anywhere there is recalling" (9 Oct 2026):
// tab screens stay mounted, and every save anywhere refreshed every query on
// every tab visited. Each one follows the server only while its tab is in view
// (hooks/useOnScreen). A new query on a tab without it fails here.
const TABS = readdirSync('app/(tabs)').filter((file) => file.endsWith('.tsx') && file !== '_layout.tsx');

describe('tab screens follow the server only while in view', () => {
  it.each(TABS)('%s', (file) => {
    const source = readFileSync(`app/(tabs)/${file}`, 'utf8');
    const calls = [...source.matchAll(/\b(useGet[A-Z]\w*|useQuery(?:<[^(]*>)?)\(/g)];
    for (const call of calls) {
      // The call's arguments, up to its closing parenthesis.
      let depth = 0;
      let end = call.index! + call[0].length - 1;
      for (; end < source.length; end += 1) {
        if ('([{'.includes(source[end])) depth += 1;
        else if (')]}'.includes(source[end])) { depth -= 1; if (depth === 0) break; }
      }
      const args = source.slice(call.index!, end + 1);
      expect(/\blive\)|subscribed: onScreen/.test(args), `${file}: ${args.split('\n')[0]}`).toBe(true);
    }
  });

  it('each screen knows whether it is in view', () => {
    const hook = readFileSync('hooks/useOnScreen.ts', 'utf8');
    expect(hook).toContain('return () => setOnScreen(false);');
    expect(hook).toContain('return { query: { subscribed: onScreen } }');
  });
});
