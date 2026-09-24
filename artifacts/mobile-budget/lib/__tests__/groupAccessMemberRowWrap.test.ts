import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const settings = readFileSync('app/(tabs)/settings.tsx', 'utf8');

// rowLeft (the icon + name/role column) has flex: 1, so on a member row with
// the action buttons (Make owner / Change to admin / Remove) claiming their
// own natural width on the same line, it was squeezed down to just a few
// characters wide — wrapping "Jamvi" as "Jam" / "vi" and "Member" as
// "Memb" / "er" instead of staying on one line.
describe('a member row keeps the name on one line instead of squeezing it', () => {
  const block = settings.slice(
    settings.indexOf('{members.map((member, index) => ('),
    settings.indexOf('{canLeaveGroup ?'),
  );

  it('lets the row wrap so the action buttons can drop to their own line', () => {
    expect(block).toContain("flexWrap: 'wrap'");
  });

  it('gives the name/role column a floor it cannot be squeezed below', () => {
    expect(block).toContain('[styles.rowLeft, { minWidth: 120 }]');
  });
});
