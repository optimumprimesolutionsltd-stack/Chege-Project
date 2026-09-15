import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { blobToBase64 } from '../blobToBase64';

/**
 * React Native's Blob is a polyfill over a native blob registry: it carries a
 * size and a type and almost nothing else. `arrayBuffer()` is simply absent,
 * which is why both exports threw "undefined is not a function" and reported
 * it as the report having failed.
 *
 * `FileReader.readAsDataURL` is the reader React Native does implement, so
 * these run against a stand-in shaped the same way — no arrayBuffer, results
 * delivered through onload.
 */
class ReactNativeStyleFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  static payload = 'JVBERi0xLjQK';
  static shouldFail = false;
  static emptyResult = false;

  readAsDataURL(_blob: unknown) {
    setTimeout(() => {
      if (ReactNativeStyleFileReader.shouldFail) {
        this.onerror?.();
        return;
      }
      this.result = ReactNativeStyleFileReader.emptyResult
        ? ''
        : `data:application/pdf;base64,${ReactNativeStyleFileReader.payload}`;
      this.onload?.();
    }, 0);
  }
}

const rnBlob = { size: 9, type: 'application/pdf' } as unknown as Blob;

beforeEach(() => {
  ReactNativeStyleFileReader.shouldFail = false;
  ReactNativeStyleFileReader.emptyResult = false;
  vi.stubGlobal('FileReader', ReactNativeStyleFileReader);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('blobToBase64', () => {
  it('never touches arrayBuffer, which React Native does not have', () => {
    expect('arrayBuffer' in rnBlob).toBe(false);
  });

  it('returns the payload without the data-URL prefix', async () => {
    await expect(blobToBase64(rnBlob)).resolves.toBe('JVBERi0xLjQK');
  });

  it('copes with a reader that returns a bare base64 string', async () => {
    ReactNativeStyleFileReader.payload = 'QUJD';
    const result = await blobToBase64(rnBlob);
    expect(result).toBe('QUJD');
    ReactNativeStyleFileReader.payload = 'JVBERi0xLjQK';
  });

  it('rejects when the reader fails rather than writing a broken file', async () => {
    ReactNativeStyleFileReader.shouldFail = true;
    await expect(blobToBase64(rnBlob)).rejects.toThrow('could not be read on this phone');
  });

  it('rejects an empty read rather than saving a zero-byte PDF', async () => {
    ReactNativeStyleFileReader.emptyResult = true;
    await expect(blobToBase64(rnBlob)).rejects.toThrow('was empty');
  });
});

describe('the exports use the safe writer', () => {
  const contributions = readFileSync('components/ContributionExport.tsx', 'utf8');
  const reports = readFileSync('app/(tabs)/reports.tsx', 'utf8');

  it('no longer calls arrayBuffer anywhere', () => {
    for (const source of [contributions, reports]) {
      expect(source).not.toContain('arrayBuffer()');
      expect(source).toContain('writePdf(');
    }
  });
});
