import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
const record = readFileSync('app/record-contributions.tsx', 'utf8');

describe('deposit source of funds', () => {
  // Choosing Joint bank left "Other" as the only thing on offer: depositorIds
  // is empty for the joint bank, and the query was disabled in exactly that
  // case even though the endpoint answers group-wide without a userId.
  it('asks for the group’s streams when the joint bank is depositing', () => {
    expect(bank).toContain("singleDepositorId ? `/api/income-sources?userId=${singleDepositorId}` : '/api/income-sources'");
    expect(bank).toContain("enabled: txType === 'deposit' && (!!singleDepositorId || depositorIds.length === 0)");
  });

  it('keeps one named depositor’s own streams when there is one', () => {
    expect(bank).toContain("queryKey: ['income-sources', singleDepositorId ?? '__group__']");
    expect(bank).toContain("'Which of their income streams?'");
  });
});

describe('moving money between bank accounts', () => {
  // "From" was a label showing whichever account was selected behind the
  // sheet, with no way to change it without closing the form.
  it('lets both ends be chosen in place', () => {
    expect(bank).toContain('testID={`bank-transfer-source-${candidate.id}`}');
    expect(bank).toContain('testID={`bank-transfer-destination-${candidate.id}`}');
  });

  it('never lets one account be both ends', () => {
    expect(bank).toContain('if (bankTransferDestinationId === candidate.id) setBankTransferDestinationId(null);');
    expect(bank).toContain('accounts.filter((candidate) => candidate.id !== selectedAccountId)');
  });

  it('offers a way to make the second account without leaving the form', () => {
    expect(bank).toContain('testID="bank-transfer-new-account"');
    expect(bank).toContain('onPress={() => openAccountEditor()}');
    expect(bank).toContain('A transfer needs a second account to move the money into.');
  });
});

describe('Record contributions reads as sections', () => {
  it('puts the bank account in its own panel', () => {
    expect(record).toContain('WHERE IT LANDS');
    expect(record).toContain('styles.sectionCard');
  });

  it('puts the amount mode and its explanation in one panel', () => {
    expect(record).toContain('HOW MUCH EACH PERSON PAID');
    // The rule that matters stays inside that panel rather than floating loose.
    const panel = record.slice(record.indexOf('HOW MUCH EACH PERSON PAID'), record.indexOf('{mode === \'simple\' && ('));
    expect(panel).toContain('Everyone is ticked to start.');
    expect(panel).toContain('Same amount');
    expect(panel).toContain('Per person');
  });

  it('gives a section a visible edge rather than bare stacked rows', () => {
    expect(record).toContain('sectionCard: { borderWidth: 1, borderRadius: 12, padding: 12 }');
  });
});
