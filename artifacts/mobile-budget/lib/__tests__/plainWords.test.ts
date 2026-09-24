import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const mobile = ['app/(tabs)/bank.tsx', 'app/(tabs)/budget.tsx', 'app/(tabs)/debt.tsx', 'app/(tabs)/settings.tsx', 'app/bank-statement.tsx', 'app/parties.tsx', 'app/add-expense.tsx'];
const web = ['components/layout.tsx', 'pages/bank.tsx', 'pages/budget.tsx', 'pages/parties.tsx', 'pages/statement.tsx', 'pages/activity.tsx'];

// Screens a twelve-year-old meets should say what they mean. These are the
// accounting words that were on them.
const BANNED = [
  'Closing balance', 'Opening balance', 'Creditors and debtors', 'Creditors & debtors',
  'Priority tier report', 'Disbursement recorded', 'Unattributed funding', 'Joint / Unattributed',
];

describe('plain words on screen', () => {
  it.each(mobile)('mobile %s', (file) => {
    const source = read(file);
    for (const word of BANNED) expect(source).not.toContain(word);
  });
  it.each(web)('web %s', (file) => {
    const source = read(`../family-budget/src/${file}`);
    for (const word of BANNED) expect(source).not.toContain(word);
  });
  it('says balance now, starting balance and who owes who', () => {
    expect(read('app/(tabs)/bank.tsx')).toContain('Balance now');
    expect(read('app/(tabs)/bank.tsx')).toContain('Starting balance');
    expect(read('app/parties.tsx')).toContain('Who owes who');
  });
});
