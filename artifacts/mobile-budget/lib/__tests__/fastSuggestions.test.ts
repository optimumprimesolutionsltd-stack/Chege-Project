import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rememberByText } from '../rememberByText';

// On the phone, suggestions for 354 lines took 12 s with no history and no rules
// (11 Oct 2026): each line's payee was tidied and lower-cased the Kenyan way
// about ten times, and locale-aware text work is very slow on Android's engine.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === '__tests__') return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && name !== 'pdfjsBundle.ts' ? [path] : [];
  });
}

describe('suggestions are quick on a phone', () => {
  it('never lower- or upper-cases by locale in the phone app', () => {
    for (const file of [...sources('lib'), ...sources('app'), ...sources('components'), ...sources('hooks')]) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/toLocale(Lower|Upper)Case\(/);
    }
  });

  it('works a payee name out once', () => {
    let runs = 0;
    const tidy = rememberByText((text: string) => { runs += 1; return text.trim().toLowerCase(); });
    expect(tidy(' Mary Wanjiku ')).toBe('mary wanjiku');
    expect(tidy(' Mary Wanjiku ')).toBe('mary wanjiku');
    expect(runs).toBe(1);
  });

  it('remembers the known-payee match and each line\'s product, loan and savings', () => {
    expect(readFileSync('lib/knownPayees.ts', 'utf8')).toContain('function knownPayeeFor(description: string): KnownPayee | null {');
    const products = readFileSync('lib/mpesaProducts.ts', 'utf8');
    for (const name of ['productOf', 'loanOf', 'savingsOf']) expect(products).toContain(`const ${name}Memo = new WeakMap`);
    const learning = readFileSync('lib/payeeLearning.ts', 'utf8');
    expect(learning).toContain('export const distinctiveWords = rememberByText(');
    expect(learning).toContain('export const looksLikePerson = rememberByText(');
  });
});
