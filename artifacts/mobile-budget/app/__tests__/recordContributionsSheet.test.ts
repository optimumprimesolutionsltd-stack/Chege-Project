import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/record-contributions.tsx', 'utf8');
const exportSource = readFileSync('components/ContributionExport.tsx', 'utf8');

describe('Record contributions', () => {
  // Picking the first account on someone's behalf is how money lands in the
  // wrong account without anyone noticing.
  it('only preselects a bank account when there is exactly one', () => {
    expect(source).toContain('return accounts.length === 1 ? accounts[0].id : null;');
    expect(source).not.toContain('accounts[0]?.id ?? null');
  });

  it('keeps Record disabled until an account is actually chosen', () => {
    expect(source).toContain('accountId != null');
  });

  it('still offers a picker when there is more than one account', () => {
    expect(source).toContain("testID=\"record-contributions-account-picker\"");
    expect(source).toContain("'Choose an account'");
  });

  // Inside a formSheet the safe-area inset reads 0, so the footer sat behind
  // the phone's gesture/navigation strip and clipped the Record button.
  it('floors the sheet bottom inset so the Record button clears the nav bar', () => {
    expect(source).toContain('const sheetBottomInset = Math.max(insets.bottom, 16);');
    expect(source).toContain('paddingBottom: sheetBottomInset + 12');
    expect(source).toContain('paddingBottom: sheetBottomInset + 96');
  });
});

describe('the contribution statement PDF error', () => {
  // Blaming the connection for a 500 sends people to restart their router —
  // but guessing at the cause at all hid it for three rounds of "still not
  // working", so the message now carries what actually failed.
  it('separates a server failure from a local one', () => {
    expect(exportSource).toContain('status != null && status >= 500');
    expect(exportSource).toContain('The server could not build the report.');
    expect(exportSource).toContain('The report failed on this phone, not on the server.');
  });

  it('shows the underlying error rather than throwing it away', () => {
    expect(exportSource).toContain('const detail = error instanceof Error ? error.message : String(error);');
    expect(exportSource).toContain('detail,');
    // A refusal that is neither 5xx nor a local fault still names its status.
    expect(exportSource).toContain('The server refused the request (${status}).');
  });

  it('never blames group access on a manager-only screen', () => {
    expect(exportSource).not.toContain('Check your group access');
  });
});
