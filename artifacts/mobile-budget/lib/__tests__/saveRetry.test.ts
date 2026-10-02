import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { isServerHiccup, plainSaveError, retrySave, withRetries } from '@/lib/saveRetry';
import type { PostingApi } from '@/lib/savePosting';

const failed = (status: number, message: string, data?: unknown) => Object.assign(new Error(message), { status, data });

// Reported 2 Oct 2026, saving during a deploy: "Christopher Maina: HTTP 502 :
// <!DOCTYPE html>…" under an entry, and "the entry saved, but its charge did not".
describe('saving through a server restart', () => {
  it('treats no answer and 502/503/504 as the server briefly not there', () => {
    expect(isServerHiccup(new TypeError('Network request failed'))).toBe(true);
    for (const status of [502, 503, 504]) expect(isServerHiccup(failed(status, 'x'))).toBe(true);
    expect(isServerHiccup(failed(500, 'x'))).toBe(false);
    expect(isServerHiccup(failed(409, 'x'))).toBe(false);
  });

  it('retries the M-Pesa charge as well as the entry', async () => {
    const disbursement = vi.fn().mockRejectedValueOnce(failed(502, 'gateway')).mockResolvedValue({ id: 2 });
    const api = { disbursement } as unknown as PostingApi;
    const wrapped = withRetries(api, (task) => retrySave(task, { pause: async () => {} }));
    await expect(wrapped.disbursement({})).resolves.toEqual({ id: 2 });
    expect(disbursement).toHaveBeenCalledTimes(2);
  });

  it('never shows a status code or a web page', () => {
    const page = failed(502, 'HTTP 502 Bad Gateway: <!DOCTYPE html><html lang="en"><head>');
    expect(plainSaveError(page)).toBe('Jamvi could not reach its server just then. Nothing was lost - tap Save again to try this one.');
    expect(plainSaveError(failed(409, 'HTTP 409 Conflict: Already recorded', { error: 'Already recorded on 3 Jan.' }))).toBe('Already recorded on 3 Jan.');
    expect(plainSaveError(failed(400, 'HTTP 400 Bad Request: Choose a category'))).toBe('Choose a category');
    expect(plainSaveError(failed(400, 'HTTP 400 : <html>'))).toBe('It was not saved. Tap Save again to try it.');
  });
});

describe('adding a debtor or creditor from the import', () => {
  const phone = readFileSync('app/mpesa-import.tsx', 'utf8');
  const web = readFileSync('../family-budget/src/pages/mpesa-import.tsx', 'utf8');

  it('offers Someone new in the debt sheet, named from the payee', () => {
    expect(phone).toContain('＋ Someone new');
    expect(phone).toContain("setNewParty({ name: line ? payeeName(line.original ?? line.description ?? '') : '', kind: 'person' });");
    expect(phone).toContain("JSON.stringify({ name, kind: newParty.kind })");
    expect(web).toContain('＋ Someone new');
    expect(web).toContain('JSON.stringify({ name, kind: newParty.kind })');
  });

  it('no longer needs somebody to exist already before a line can be a debt', () => {
    expect(phone).not.toContain('canLinkDebt(item, parties) && parties.length > 0');
    expect(web).not.toContain('canLinkDebt(item, parties) && parties.length > 0');
  });

  it('says why an entry did not save in words on the web too', () => {
    expect(web).toContain('withRetries(rawPostingApi');
    expect(web).toContain('const message = plainSaveError(error);');
  });
});
