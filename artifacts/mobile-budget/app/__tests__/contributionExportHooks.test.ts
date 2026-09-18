import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('components/ContributionExport.tsx', 'utf8');
const lines = source.split('\n');

/** Line numbers, 1-based, of hook calls at the top level of a component body. */
function hookLines(): number[] {
  return lines
    .map((line, index) => (/^ {2}(?:const .*=\s*)?use[A-Z]\w*\(/.test(line) ? index + 1 : 0))
    .filter((line) => line > 0);
}

function guardLine(): number {
  const index = lines.findIndex((line) => /^ {2}if \(!isManager\) return null;/.test(line));
  expect(index).toBeGreaterThan(-1);
  return index + 1;
}

// "Share the report" came up blank for exactly the owners and admins it is
// built for. useGetGroup has not answered on the first render, so isManager is
// false, the component returned early, and the effect below the guard was
// never registered. The render after it registered one hook more than the
// render before — which React refuses — and the card rendered as nothing.
describe('the manager guard does not skip a hook', () => {
  it('runs every hook before deciding whether to render', () => {
    const guard = guardLine();
    const late = hookLines().filter((line) => line > guard);
    expect(late).toEqual([]);
  });

  it('keeps the effect itself from firing for a non-manager', () => {
    // The guard no longer stops it, so the effect has to stop itself.
    expect(source).toContain('if (!viewing || !isManager) return;');
    expect(source).toContain('}, [viewing, viewFrom, viewTo, isManager]);');
  });
});
