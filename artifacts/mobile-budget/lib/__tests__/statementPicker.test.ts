import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDocumentAsync } = vi.hoisted(() => ({ getDocumentAsync: vi.fn() }));
vi.mock('expo-file-system', () => ({ File: class {} }));

import { chooseStatement, setPickerForTests, STATEMENT_TYPES } from '../statementFile';

// "choose the statement pdf tab still slow or not working" (10 Oct 2026).
describe('choosing the statement PDF', () => {
  beforeEach(() => {
    getDocumentAsync.mockReset();
    setPickerForTests({ getDocumentAsync });
  });

  it('lets through a statement saved as a plain file, not only one labelled PDF', async () => {
    getDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/s.pdf', name: 'MPESA_Statement.pdf' }] });
    await expect(chooseStatement()).resolves.toEqual({ uri: 'file:///cache/s.pdf', name: 'MPESA_Statement.pdf' });
    expect(getDocumentAsync).toHaveBeenCalledWith({ type: STATEMENT_TYPES, copyToCacheDirectory: true });
    expect(STATEMENT_TYPES).toEqual(expect.arrayContaining(['application/pdf', 'application/octet-stream']));
  });

  it('treats a second picker while one is open as nothing, and backing out as no file', async () => {
    getDocumentAsync.mockRejectedValue(new Error('Different document picking in progress. Await other document picking first.'));
    await expect(chooseStatement()).resolves.toBeNull();
    getDocumentAsync.mockResolvedValue({ canceled: true });
    await expect(chooseStatement()).resolves.toBeNull();
    getDocumentAsync.mockRejectedValue(new Error('No permission'));
    await expect(chooseStatement()).rejects.toThrow('No permission');
  });

  it('says it is opening, takes no second tap, and frees itself when Jamvi comes back', () => {
    const screen = readFileSync(join(__dirname, '../../app/mpesa-import.tsx'), 'utf8');
    expect(screen).toContain("pickingStatement ? 'Opening your files…'");
    expect(screen).toContain('if (statementPickRef.current) return;');
    expect(screen).toContain("AppState.addEventListener('change'");
  });
});
