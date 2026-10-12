import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// "jamvi should treat them as indepedent for now" (12 Oct 2026): importing a church
// line's statement left its moves unticked as "Already saved in lydiah and chege".
describe('each budget keeps its own record', () => {
  it('the import does not look for a line in the person’s other budgets', () => {
    const screen = readFileSync(join(__dirname, '..', '..', 'app', 'mpesa-import.tsx'), 'utf8');
    expect(screen).not.toContain("'/api/possible-duplicates/elsewhere'");
  });
});
