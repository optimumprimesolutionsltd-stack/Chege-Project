import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shownFileName } from '@/lib/shownFileName';
import { readerHtml } from '@/lib/statementReaderHtml';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === '__tests__') return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && name !== 'pdfjsBundle.ts' ? [path] : [];
  });
}

// The picker and the reader page are native code. An update reaches old builds that
// do not have them, and importing a missing native module fails the app at start.
describe('statement reading is safe on a build without the native modules', () => {
  const files = [...sources('app'), ...sources('lib'), ...sources('components'), ...sources('hooks')];

  it('never imports the native modules at the top of a file', () => {
    for (const file of files) {
      const text = read(file);
      expect(text, file).not.toMatch(/^import [^;]*from ['"]expo-document-picker['"]/m);
      expect(text, file).not.toMatch(/^import [^;]*from ['"]react-native-webview['"]/m);
    }
  });

  it('loads them inside a try, and offers statements only when both are there', () => {
    const text = read('lib/statementFile.ts');
    expect(text).toContain("require('expo-document-picker')");
    expect(text).toContain("require('react-native-webview')");
    expect(text).toContain('export const canReadStatements = picker !== null && webViewAvailable;');
    expect(read('components/StatementReader.tsx')).toContain("require('react-native-webview')");
  });

  it('only shows the statement section when the build can read one', () => {
    expect(read('app/mpesa-import.tsx')).toContain('{canReadStatements ? (');
  });
});

describe('the hidden page that reads the PDF', () => {
  it('is locked to itself', () => {
    const component = read('components/StatementReader.tsx');
    expect(component).toContain('allowFileAccess={false}');
    expect(component).toContain('setSupportMultipleWindows={false}');
    expect(component).toContain("mixedContentMode=\"never\"");
    expect(component).toContain('onShouldStartLoadWithRequest');
  });

  it('does not reach out to any network', () => {
    const html = readerHtml('LIB', 'WORKER');
    expect(html).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|sendBeacon/);
  });

  it('keeps the library from ending the inline script early', () => {
    const html = readerHtml('a</script><b>', 'w</script>');
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });

  it('says when it is ready, and hands back only positions of text or why it failed', () => {
    const html = readerHtml('LIB', 'WORKER');
    expect(html).toContain("post({ type: 'ready' })");
    expect(html).toContain("post({ type: 'pages', pages })");
    expect(html).toContain("type: 'error'");
  });
});

describe('the statement section of the M-Pesa screen', () => {
  const screen = read('app/mpesa-import.tsx');

  it('reads the PDF on the phone, and never sends the file or its password', () => {
    const upload = screen.slice(screen.indexOf('/api/mpesa/import/check-receipts'), screen.indexOf('/api/mpesa/import/check-receipts') + 300);
    expect(upload).toContain('receipts: codes');
    expect(upload).not.toContain('statementPassword');
    expect(screen).toContain("setStatementPassword('');");
  });

  it('refuses a statement that does not add up', () => {
    expect(screen).toContain('if (!checkRunningBalance(rows).ok)');
    expect(screen).toContain('will not risk recording wrong amounts');
  });

  it('shows whether saving would match the statement', () => {
    expect(screen).toContain("testID=\"mpesa-statement-balance\"");
    expect(screen).toContain('Will not match your statement exactly');
  });

  it('hides a phone number in the file name', () => {
    expect(shownFileName('MPESA_Statement_2026-09-25_to_2026-09-01_254700000000.pdf')).toBe('MPESA_Statement_2026-09-25_to_2026-09-01_….pdf');
    expect(shownFileName('statement.pdf')).toBe('statement.pdf');
  });
});
