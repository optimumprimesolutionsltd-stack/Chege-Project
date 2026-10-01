import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { amountIn, categoriseLines, chooseCategory, confirmLines, isConfirmedToSave, lineMatches, streamableLines, streamLines, type Choice, type PreviewLine } from '@/lib/mpesaImport';

const line = (over: Partial<PreviewLine>): PreviewLine => ({
  index: 0, status: 'ready', reason: null, receipt: 'TESTSEND1', direction: 'out', type: 'paybill_payment', amount: 1000,
  description: 'Safaricom Home Fibre', date: '2026-09-02', fee: null, mpesaBalance: 0, alreadyRecorded: null, ...over,
});

// "Can I search with amounts too? Paying a particular amount always could mean a particular category."
describe('searching the import by amount', () => {
  it('finds the exact amount however it is written', () => {
    for (const query of ['1000', '1,000', 'KES 1,000', 'ksh 1000', 'kes1000', '1000.00']) {
      expect(lineMatches(line({}), query)).toBe(true);
    }
  });

  it('does not take 2,000 for 12,000 or 20,000', () => {
    expect(lineMatches(line({ amount: 12_000 }), '2,000')).toBe(false);
    expect(lineMatches(line({ amount: 20_000 }), '2000')).toBe(false);
    expect(lineMatches(line({ amount: 2_000 }), '2000')).toBe(true);
  });

  it('mixes an amount with a name', () => {
    expect(lineMatches(line({}), 'safaricom 1,000')).toBe(true);
    expect(lineMatches(line({}), 'naivas 1,000')).toBe(false);
  });

  it('still finds a till or paybill number', () => {
    expect(lineMatches(line({ amount: 50, payeeNumber: '522522' }), '522522')).toBe(true);
  });

  it('reads an amount only from a number', () => {
    expect(amountIn('1,250.50')).toBe(1250.5);
    expect(amountIn('2026-09-02')).toBeNull();
    expect(amountIn('naivas')).toBeNull();
  });
});


// "Also can be inwards or outwards."
describe('searching money in or money out', () => {
  const salary = line({ index: 1, direction: 'in', type: 'deposit', description: 'ACME LTD', amount: 50_000 });
  const rent = line({ index: 2, direction: 'out', description: 'Landlord', amount: 50_000 });

  it('narrows to the direction asked for', () => {
    expect(lineMatches(salary, 'in 50,000')).toBe(true);
    expect(lineMatches(rent, 'in 50,000')).toBe(false);
    expect(lineMatches(rent, 'paid 50000')).toBe(true);
    expect(lineMatches(salary, 'out')).toBe(false);
    expect(lineMatches(salary, 'received')).toBe(true);
  });

  it('gives money in that was found one income stream, which then counts as confirmed', () => {
    const choices: Record<number, Choice> = { 1: { include: true, category: '' }, 2: { include: true, category: 'Rent', auto: true } };
    const targets = streamableLines([salary, rent], choices);
    expect(targets.map((found) => found.index)).toEqual([1]);
    const next = streamLines(targets, choices, 7);
    expect(next[1]).toMatchObject({ incomeSourceId: 7, sourceAuto: false });
    expect(isConfirmedToSave(salary, next[1])).toBe(true);
    expect(next[2]).toBe(choices[2]);
  });

  it('is offered on the review, asking first', () => {
    const screen = readFileSync('app/mpesa-import.tsx', 'utf8');
    expect(screen).toContain('testID="mpesa-review-stream-found"');
    expect(screen).toContain("onPress: () => setChoices((current) => streamLines(toStream, current, source.id)) },");
  });
});


// "When the selection is done as per category Jamvi remembers - the box ticked
// automatically, and one can untick what he doesn't want remembered."
describe('choosing a category ticks Remember', () => {
  const lines = [line({ index: 0, description: 'NAIVAS' })];

  it('when chosen on one line, confirmed, or given to everything found', () => {
    expect(chooseCategory(lines, { 0: { include: true, category: '' } }, 0, 'Groceries')[0].remember).toBe(true);
    expect(confirmLines(lines, { 0: { include: true, category: 'Groceries', auto: true } })[0].remember).toBe(true);
    expect(categoriseLines(lines, { 0: { include: true, category: '' } }, 'Groceries')[0].remember).toBe(true);
  });

  it('keeps it unticked once the person unticked it', () => {
    const unticked = { 0: { include: true, category: 'Groceries', auto: false, remember: false } };
    expect(chooseCategory(lines, unticked, 0, 'Food')[0].remember).toBe(false);
    expect(confirmLines(lines, unticked)[0].remember).toBe(false);
    expect(categoriseLines(lines, unticked, 'Food')[0].remember).toBe(false);
  });

  it('can be unticked on the web too', () => {
    const web = readFileSync('../family-budget/src/pages/mpesa-import.tsx', 'utf8');
    expect(web).toContain('data-testid={`mpesa-line-remember-${item.index}`}');
  });
});
