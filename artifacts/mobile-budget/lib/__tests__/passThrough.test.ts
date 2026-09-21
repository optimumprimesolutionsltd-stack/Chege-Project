import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const screen = readFileSync('app/pass-through.tsx', 'utf8');
const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
const help = readFileSync('lib/helpTopics.ts', 'utf8');

// Kamau owes you; you owe Mwangi. Kamau's money lands in your account and
// leaves again to Mwangi the same day, and none of it was ever yours. Both
// halves could be recorded one at a time, but that means entering the same
// amount twice and remembering that neither is income nor spending — and
// missing either marking hands the month money that was never earned.
describe('one party paying another through your account', () => {
  it('is reachable from the Banking tab', () => {
    expect(bank).toContain('testID="bank-pass-through-action"');
    expect(bank).toContain("router.push('/pass-through')");
  });

  it('asks who paid and who was paid', () => {
    expect(screen).toContain('testID={`pass-through-${which}`}');
    expect(screen).toContain('Who is paying');
    expect(screen).toContain('Who is being paid');
  });

  it('shows which way each balance stands while choosing', () => {
    expect(screen).toContain("`owes you KES ${formatKES(party.owedToUs ?? 0)}`");
    expect(screen).toContain("`you owe KES ${formatKES(party.owedByUs ?? 0)}`");
  });

  it('refuses one person on both sides', () => {
    // The two balance changes would fight over the same row.
    expect(screen).toContain('if (payer.id === payee.id) {');
    expect(screen).toContain("Alert.alert('They are the same person'");
  });

  it('says what will happen before it happens', () => {
    expect(screen).toContain('testID="pass-through-preview"');
    expect(screen).toContain('Your balance ends where it started.');
  });
});

describe('it writes two ordinary postings', () => {
  it('records the money in as a repayment, not income', () => {
    expect(screen).toContain('settlesContributorId: payer.id,');
  });

  it('records the money out as not spending', () => {
    // The money was never yours to spend. Same reasoning as lending, and it
    // keeps the pair out of the month's figures on both sides, not just one.
    expect(screen).toContain('isLending: true,');
  });

  it('saves the money in first, in the order it happened', () => {
    // If the second fails, what stands is a repayment that really did reach
    // the account — true and correctable — rather than a payment made from
    // money never received.
    expect(screen.indexOf('await createDeposit({')).toBeLessThan(screen.indexOf('await createDisbursement({'));
  });

  it('leaves nothing behind saying they arrived together', () => {
    expect(screen).not.toContain('passThroughId');
    expect(screen).not.toContain('batchId');
  });

  it('gives both postings the same date and account', () => {
    expect((screen.match(/accountId: activeAccountId,/g) ?? []).length).toBe(2);
    expect((screen.match(/^ +date,$/gm) ?? []).length).toBe(2);
  });
});

describe('both balances are offered together', () => {
  it('asks once rather than twice', () => {
    // Never spanning a line: these files are CRLF on disk.
    expect(screen).toContain("'Update both balances?',");
    expect(screen).toContain('Both postings are saved either way.');
  });

  it('takes the amount off each side', () => {
    expect(screen).toContain('const payerLeft = Math.max(0, toMoney(owedToUs - total));');
    expect(screen).toContain('const payeeLeft = Math.max(0, toMoney(owedByUs - total));');
  });

  it('never drives either below zero', () => {
    expect((screen.match(/Math\.max\(0, toMoney\(/g) ?? []).length).toBe(2);
  });

  it('is offered, never applied', () => {
    expect(screen).toContain("{ text: 'Not now', style: 'cancel', onPress: () => router.back() },");
  });

  it('is in the guide', () => {
    expect(help).toContain('Somebody who owes you paying somebody you owe');
  });
});
