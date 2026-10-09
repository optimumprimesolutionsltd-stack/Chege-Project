import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// "How can we get the business model working here?" (9 Oct 2026, on the import
// screen): every line asks Who is this for?, both apps, and the old question
// about a different budget waits behind a link.
const phone = readFileSync('app/mpesa-import.tsx', 'utf8');
const web = readFileSync('../family-budget/src/pages/mpesa-import.tsx', 'utf8');

describe('Who is this for? on M-Pesa import lines', () => {
  it('is asked on each line, compact, with its own test ids', () => {
    expect(phone).toContain('<WhoIsThisFor');
    expect(phone).toContain('compact');
    expect(phone).toContain('testIDSuffix={`-${item.index}`}');
    expect(web).toContain('<WhoIsThisFor');
    expect(web).toContain('index={item.index}');
  });

  it('chooses through the shared logic', () => {
    for (const screen of [phone, web]) {
      expect(screen).toContain('chooseBusiness(lines ?? [], current,');
      expect(screen).toContain('costOwners(');
    }
  });

  it('remembers the business\'s payees after Save', () => {
    for (const screen of [phone, web]) {
      expect(screen).toContain('businessPayees(lines, choices, savedIndexes, owners, businessIds)');
      expect(screen).toContain('withSourceRule(kept, payee.description, payee.business)');
    }
    // The phone also names the payee (Named accounts), in the same write as the rules.
    expect(phone).toContain('namedPayees.replaceAll(named)');
  });

  it('a business line offers no Not sure and no plain new category', () => {
    expect(phone).toContain("canManageBudget && businessFor(item) === null ? (");
    expect(phone).toContain("isNotSure(choice.category)) && businessFor(item) === null ? (");
  });

  it('asks about a separate budget only when asked to', () => {
    for (const screen of [phone, web]) {
      expect(screen).not.toContain('Does this belong to a different budget you run?');
      expect(screen).toContain('Record it in a separate budget instead');
      expect(screen).toContain('otherBudgetOpen.has(item.index)');
    }
  });

  it('the web draws the Remember box once per line', () => {
    expect(web.split('data-testid={`mpesa-line-remember-${item.index}`}').length - 1).toBe(1);
  });
});

describe('import lines stay short (9 Oct 2026)', () => {
  const card = readFileSync('components/WhoIsThisFor.tsx', 'utf8');
  it('Who is this for? is one sideways row of chips on the import, the chosen business first', () => {
    expect(card).toContain('<ChipRow compact={compact}>');
    expect(card).toContain('compact && chosen ? [chosen, ...businesses.filter((one) => one.id !== chosen.id)] : businesses');
  });

  it('a note is added on the line itself, not under More', () => {
    const more = phone.indexOf('More: debt or loan, between my accounts, savings, another budget');
    expect(phone.indexOf('Add a note (optional)')).toBeGreaterThan(more);
  });
});
