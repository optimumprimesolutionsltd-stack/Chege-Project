import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mpesa = readFileSync('app/mpesa-import.tsx', 'utf8');
const reader = readFileSync('lib/statementReaderHtml.ts', 'utf8');
const readerView = readFileSync('components/StatementReader.tsx', 'utf8');

// A January-to-September statement closed Jamvi with no message: every entry
// was drawn at once, thousands of cards, and Android ran out of memory.
describe('a long statement does not run the phone out of memory', () => {
  it('draws the review list a page at a time', () => {
    expect(mpesa).toContain('const LINES_PER_PAGE = 25;');
    expect(mpesa).toContain('{inView.slice(0, shownCount).map((item) => {');
    expect(mpesa).toContain('{notImported.slice(0, shownSkipped).map((item) => (');
    expect(mpesa).toContain('testID="mpesa-show-more"');
    expect(mpesa).toContain('testID="mpesa-show-more-skipped"');
  });

  it('draws as far as the first problem before going to it', () => {
    expect(mpesa).toContain('if (drawing) setShownCount(Math.ceil((at + 1) / LINES_PER_PAGE) * LINES_PER_PAGE);');
  });

  it('lets go of each PDF page once its text is read', () => {
    expect(reader).toContain('page.cleanup();');
    expect(reader).toContain('loadingTask.destroy().catch(() => {});');
    expect(reader).not.toContain('doc.destroy(');
  });

  it('says so at once when the phone stops the reader, and makes a new one', () => {
    expect(readerView).toContain('onRenderProcessGone={pageGone}');
    expect(readerView).toContain('onContentProcessDidTerminate={pageGone}');
    expect(readerView).toContain('key={generation}');
    expect(mpesa).toContain('if (result.message === READER_STOPPED) throw new Error(READER_STOPPED);');
  });
});
