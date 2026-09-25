import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALREADY_GONE_MESSAGE, ALREADY_GONE_TITLE, isNotFound } from '@/lib/staleEntry';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// From a real phone: deleting a bank entry showed "HTTP 404 : Not found".
describe('isNotFound', () => {
  it('recognises the API error by its status', () => {
    expect(isNotFound(Object.assign(new Error('HTTP 404 : Not found'), { status: 404 }))).toBe(true);
    expect(isNotFound({ status: 404 })).toBe(true);
  });

  it('recognises it by its message when the status is not carried', () => {
    expect(isNotFound(new Error('HTTP 404 : Not found'))).toBe(true);
    expect(isNotFound(new Error('HTTP 404 Not Found'))).toBe(true);
  });

  it('does not swallow any other failure', () => {
    expect(isNotFound(Object.assign(new Error('Forbidden'), { status: 403 }))).toBe(false);
    expect(isNotFound(new Error('HTTP 500 : Internal error'))).toBe(false);
    expect(isNotFound(new Error('Not found in cache'))).toBe(false);
    expect(isNotFound(new Error('Network request failed'))).toBe(false);
    expect(isNotFound(null)).toBe(false);
    expect(isNotFound(undefined)).toBe(false);
    expect(isNotFound('404')).toBe(false);
  });

  it('says it plainly, without the raw status', () => {
    expect(ALREADY_GONE_TITLE).toBe('Already gone');
    expect(ALREADY_GONE_MESSAGE).toContain('not here any more');
    expect(ALREADY_GONE_MESSAGE).toContain('different budget');
    expect(ALREADY_GONE_MESSAGE).not.toMatch(/404|HTTP/);
  });
});

describe('deleting something already gone', () => {
  const phone = read('app/(tabs)/bank.tsx');
  const web = read('../family-budget/src/pages/bank.tsx');

  it('refreshes every list and says so, instead of showing the raw error (phone)', () => {
    expect(phone).toContain('if (isNotFound(error)) {\n                await queryClient.invalidateQueries();');
    expect(phone).toContain('Alert.alert(ALREADY_GONE_TITLE, ALREADY_GONE_MESSAGE);');
    // Every other failure still reports itself.
    expect(phone).toContain("deletesExpense ? 'Could not delete expense' : 'Could not delete transaction'");
  });

  it('does the same on the web', () => {
    expect(web).toContain('if (isNotFound(error)) {\n        void queryClient.invalidateQueries();');
    expect(web).toContain('toast({ title: ALREADY_GONE_TITLE, description: ALREADY_GONE_MESSAGE });');
    expect(web).toContain('title: deletesExpense ? "Could not delete expense" : "Could not delete transaction"');
  });

  it('treats an entry already gone as deleted when removing several at once, on both', () => {
    expect(phone).toContain('if (!isNotFound(error)) throw error;');
    expect(web).toContain('if (!isNotFound(error)) throw error;');
  });

  it('shares the same check on both apps', () => {
    expect(read('../family-budget/src/lib/stale-entry.ts')).toBe(read('lib/staleEntry.ts').replace(/'/g, '"'));
  });
});
