import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readerHtml, type ReaderMessage } from '../statementReaderHtml';

// The reader page's own script, run against the real pdf.js the phone bundles.
// Tests that only looked for lines in the source let a call to doc.destroy() -
// gone in pdf.js 6 - through, and every statement then failed to read with
// "Jamvi could not open this file".
const html = readerHtml('', '');
const start = html.indexOf('window.__read = ');
const end = html.indexOf('\nloading.then');
const readSource = html.slice(start + 'window.__read = '.length, end).trim().replace(/;$/, '');

async function read(password: string): Promise<ReaderMessage[]> {
  const pdfjs = await import('../../../family-budget/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
  const messages: ReaderMessage[] = [];
  const post = (message: ReaderMessage) => messages.push(message);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const make = new Function('pdfjs', 'loading', 'post', 'atob', `return (${readSource});`) as (
    ...args: unknown[]
  ) => (base64: string, password: string) => Promise<void>;
  const run = make(pdfjs, Promise.resolve(), post, (value: string) => Buffer.from(value, 'base64').toString('binary'));
  const pdf = readFileSync('lib/__tests__/fixtures/reader-sample.pdf').toString('base64');
  await run(pdf, password);
  return messages;
}

describe('the statement reader reads a real PDF', () => {
  it('returns every page, having reported each one', async () => {
    const messages = await read('1234');
    const error = messages.find((message) => message.type === 'error');
    expect(error).toBeUndefined();
    expect(messages.filter((message) => message.type === 'progress')).toHaveLength(3);
    const done = messages.find((message) => message.type === 'pages');
    expect(done && done.type === 'pages' ? done.pages.map((page) => page.map((item) => item.str).join(' ')) : []).toEqual([
      'Page 1 TEST0RECEIPT',
      'Page 2 TEST1RECEIPT',
      'Page 3 TEST2RECEIPT',
    ]);
  }, 30_000);

  it('says the password is wrong', async () => {
    const messages = await read('9999');
    expect(messages).toEqual([expect.objectContaining({ type: 'error', name: 'PasswordException', code: 2 })]);
  }, 30_000);
});
