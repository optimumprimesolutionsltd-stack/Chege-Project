import { describe, expect, it } from 'vitest';
import { initialChoices, type Choice, type PreviewLine } from '@/lib/mpesaImport';

type PastPosting = Parameters<typeof initialChoices>[1][number];
import { withBandRule, withRule, withSourceRule, type PayeeRules } from '@/lib/payeeLearning';
import { alreadyKnown, teachableGroups } from '@/lib/teachJamvi';

// "The tabs are not working", "even the choose mpesa import tab takes too long to
// respond" (10 Oct 2026): a year's statement - 2,300 lines - against a year of
// history. Every band rule was scanned for every line on every tap, and every
// past payment was compared with every line on opening. Measured on a PC before
// the fix: ~260 ms a tap and ~300 ms to open; a phone is several times slower.
// Generous limits, so only a return to that shape fails.
const lines: PreviewLine[] = [];
const choices: Record<number, Choice> = {};
for (let i = 0; i < 2300; i += 1) {
  const out = i % 3 !== 0;
  lines.push({
    index: i,
    status: 'ready',
    direction: out ? 'out' : 'in',
    description: out ? `SHOP NUMBER ${i % 400} LTD` : i % 7 === 0 ? 'Received from Equity Bulk Account' : `Received from PERSON ${i % 150} KAMAU`,
    amount: 100 + (i % 50) * 37,
    date: `2026-${String(1 + (i % 9)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`,
    type: out ? 'merchant_payment' : 'person_receipt',
    payeeNumber: null,
  } as unknown as PreviewLine);
  choices[i] = { include: true, category: 'Not sure yet', auto: true } as Choice;
}
const history = Array.from({ length: 3000 }, (_, i) => ({
  type: i % 3 ? 'disbursement' : 'deposit',
  description: i % 3 ? `SHOP NUMBER ${i % 400} LTD` : `Received from PERSON ${i % 150} KAMAU`,
  expenseCategory: 'Food',
  incomeSourceId: 3,
  chargeForTransactionId: null,
})) as unknown as PastPosting[];
let rules: PayeeRules = {};
for (let i = 0; i < 300; i += 1) rules = withRule(rules, `PAYEE ${i}`, 'Food');
for (let i = 0; i < 50; i += 1) rules = withSourceRule(rules, `Received from SRC ${i}`, 3);
rules = withBandRule(rules, { base: 'src:equity bulk account', lo: 90000, hi: 110000 }, '4');

const timed = (work: () => void) => {
  work();
  const start = performance.now();
  for (let round = 0; round < 3; round += 1) work();
  return (performance.now() - start) / 3;
};

describe('a year of M-Pesa in the import review', () => {
  it('a tap: the regulars and what Jamvi filed, worked out again', () => {
    expect(timed(() => { teachableGroups(lines, choices, rules); alreadyKnown(lines, choices, rules); })).toBeLessThan(120);
  });
  it('opening it: every line suggested from a year of history', () => {
    expect(timed(() => initialChoices(lines, history, ['Food', 'Rent', 'Transport', 'Groceries'], '', rules))).toBeLessThan(200);
  });
});
