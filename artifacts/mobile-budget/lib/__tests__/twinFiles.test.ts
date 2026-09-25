import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// The logic the phone and the web share is written once, on the phone, and copied to the
// web with only the quotes and the import paths changed. `python scripts/sync-web-twins.py`
// writes the copies; this fails, naming the file, if one was left behind.
const NORMALISE = (text: string) =>
  text
    .replace(/['"]/g, '"')
    .replace(/\.\/(mpesaImport|mpesa-import)/g, './mpesa-import')
    .replace(/\.\/(mpesaDebts|mpesa-debts)/g, './mpesa-debts')
    .replace(/\.\/(payeeLearning|payee-learning)/g, './payee-learning')
    .replace(/\.\/(statementTable|statement-table)/g, './statement-table');

const PAIRS: Array<[string, string]> = [
  ['lib/mpesaImport.ts', '../family-budget/src/lib/mpesa-import.ts'],
  ['lib/mpesaDebts.ts', '../family-budget/src/lib/mpesa-debts.ts'],
  ['lib/payeeLearning.ts', '../family-budget/src/lib/payee-learning.ts'],
  ['lib/savePosting.ts', '../family-budget/src/lib/save-posting.ts'],
  ['lib/statementTable.ts', '../family-budget/src/lib/statement-table.ts'],
  ['lib/statementImport.ts', '../family-budget/src/lib/statement-import.ts'],
];

describe('the phone and the web share one copy of the logic', () => {
  for (const [phone, web] of PAIRS) {
    it(`${phone} matches ${web.split('/').pop()}`, () => {
      expect(NORMALISE(read(web))).toBe(NORMALISE(read(phone)));
    });
  }

  it('the sync script covers every pair it can write', () => {
    const script = read('scripts/sync-web-twins.py');
    for (const [phone, web] of PAIRS.slice(0, 4)) {
      expect(script).toContain(`'${phone.replace('lib/', '')}'`);
      expect(script).toContain(`'${web.split('/').pop()}'`);
    }
  });
});
