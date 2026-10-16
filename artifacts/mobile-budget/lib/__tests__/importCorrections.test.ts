import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importCorrections, type Choice, type PreviewLine } from '../mpesaImport';

// "Where the M-Pesa reading files things wrongly ... how do i know this?" (16 Oct 2026).
const line = (index: number, type: string, description: string, direction: 'in' | 'out' = 'out'): PreviewLine => ({
  index, status: 'ready', reason: null, receipt: `R${index}`, direction, type, amount: 100, description,
  date: '2026-10-15', fee: null, mpesaBalance: null, alreadyRecorded: null,
});

describe('the suggestions a person changed, sent after a save', () => {
  const lines = [
    line(1, 'merchant_payment', 'NAIVAS WESTLANDS'),
    line(2, 'person_payment', 'JANE WANJIKU'),
    line(3, 'paybill_payment', 'KPLC PREPAID'),
    line(4, 'merchant_payment', 'QUICKMART'),
  ];
  const choices: Record<number, Choice> = {
    1: { include: true, category: 'Household', suggested: 'Groceries' },
    2: { include: true, category: 'Family support', suggested: 'Not sure yet' },
    3: { include: true, category: 'Electricity', suggested: 'Electricity', auto: true },
    4: { include: false, category: 'Household', suggested: 'Groceries' },
  };

  it('lists each changed one, with the business named but never a person', () => {
    expect(importCorrections(lines, choices)).toEqual([
      { direction: 'out', type: 'merchant_payment', payee: 'NAIVAS WESTLANDS', suggested: 'Groceries', chosen: 'Household' },
      { direction: 'out', type: 'person_payment', payee: null, suggested: 'Not sure yet', chosen: 'Family support' },
    ]);
  });

  it('remembers what Jamvi suggested from the start', () => {
    const lib = readFileSync('lib/mpesaImport.ts', 'utf8');
    expect(lib.match(/\.\.\.\(suggested \? \{ suggested \} : \{\}\),/g)).toHaveLength(2);
  });

  it('is sent by the phone and the web after a save', () => {
    expect(readFileSync('app/mpesa-import.tsx', 'utf8')).toContain("void customFetch('/api/mpesa/corrections', {");
    expect(readFileSync('../family-budget/src/pages/mpesa-import.tsx', 'utf8')).toContain('void fetch("/api/mpesa/corrections", {');
  });
});
