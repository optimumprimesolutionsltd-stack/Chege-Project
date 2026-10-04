import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { isServerHiccup, plainReadError, plainReadFailure, ReadRequestFailed, plainSaveError, retrySave, withRetries } from '@/lib/saveRetry';
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

// Reported 4 Oct 2026: reading M-Pesa messages failed with "tap Save again",
// on a screen with nothing to save yet, and was never tried a second time.
describe('reading M-Pesa messages through a server hiccup', () => {
  it('says to try again, not to tap Save', () => {
    const text = plainReadError(new TypeError('Network request failed'));
    expect(text).toContain('could not reach its server');
    expect(text).not.toContain('Save');
    expect(plainReadError(failed(502, 'HTTP 502 Bad Gateway: <!DOCTYPE html>'))).toBe(text);
    expect(plainReadError(failed(400, 'HTTP 400 Bad Request', { error: 'Paste at least one M-Pesa message.' }))).toBe('Paste at least one M-Pesa message.');
    expect(plainReadError(failed(413, 'HTTP 413 : <html>'))).toBe('They could not be read. Please try again.');
  });

  // "Could not read error is still showing" (4 Oct): a fault on the phone after
  // the answer came back was reported as the server not being reachable.
  it('blames the server only for what happened on the way there', () => {
    expect(plainReadFailure(new ReadRequestFailed(new TypeError('Network request failed')))).toContain('could not reach its server');
    const local = plainReadFailure(new TypeError("Cannot read properties of undefined (reading 'map')"));
    expect(local).not.toContain('could not reach');
    expect(local).toContain('could not show them');
    expect(local).toContain("reading 'map'");
  });

  it('waits out a hiccup before giving up on a reading', () => {
    const phone = readFileSync('app/mpesa-import.tsx', 'utf8');
    expect(phone).toMatch(/retrySave\(\(\) =>\s*customFetch<\{ lines: PreviewLine\[\] \}>\('\/api\/mpesa\/import\/preview'/);
    expect(phone.match(/'\/api\/mpesa\/import\/preview'/g)).toHaveLength(1);
    expect(phone).not.toMatch(/'Could not read them', plainSaveError/);
    expect(phone).toContain('throw new ReadRequestFailed(error);');
    expect(phone.match(/'Could not read them', plainReadFailure\(error\)/g)).toHaveLength(2);
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
