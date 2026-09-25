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

// Somebody works through a statement at their own pace: some now, the rest another day.
describe('working through a statement over several visits', () => {
  const screen = read('app/mpesa-import.tsx');

  it('keeps what is still to do for a month, never the PDF or its password', () => {
    expect(screen).toContain("key: 'mpesa-statement'");
    expect(screen).toContain('maxAgeMs: STATEMENT_DRAFT_MAX_AGE_MS');
    expect(screen).toContain('const STATEMENT_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;');
    const saved = screen.slice(screen.indexOf("key: 'mpesa-statement'"), screen.indexOf("key: 'mpesa-statement'") + 200);
    expect(saved).not.toContain('statementPassword');
    expect(saved).not.toContain('statementFile');
  });

  it('keeps the draft only while something is left to save', () => {
    expect(screen).toContain('active: statementReading !== null && statementLeft > 0,');
  });

  it('marks what was saved as recorded, so the balance card stays honest, and offers to keep going', () => {
    expect(screen).toContain("description: 'Saved from your statement'");
    expect(screen).toContain('mpesa-import-keep-going');
    expect(screen).toContain('Keep going ({statementLeft} left)');
  });

  it('asks again which entries are recorded when the statement comes back', () => {
    expect(screen).toContain('markRecorded(saved.reading.lines)');
  });
});

describe('the red message names its entry (phone)', () => {
  const screen = read('app/mpesa-import.tsx');
  it('scrolls to the entry it is about when tapped', () => {
    expect(screen).toContain('scrollRef.current?.scrollTo(');
    expect(screen).toContain('lineTops.current[item.index] = event.nativeEvent.layout.y');
    expect(screen).toContain('testID="mpesa-first-problem"');
  });
});

describe('telling what has been looked at (phone)', () => {
  const screen = read('app/mpesa-import.tsx');
  it('tags each entry, counts them and filters by them', () => {
    expect(screen).toContain('mpesa-line-status-${item.index}');
    expect(screen).toContain('mpesa-review-counts');
    expect(screen).toContain("view === 'all' || reviewStatus(item, choices[item.index]) === view");
  });
  it('shows everything before jumping to an entry a filter may hide', () => {
    expect(screen).toContain("setView('all');");
  });
});

describe('changing the category of what is already recorded (phone)', () => {
  const screen = read('app/mpesa-import.tsx');
  it('offers it on recorded spending, and asks before changing anything', () => {
    expect(screen).toContain('mpesa-recat-apply');
    expect(screen).toContain('Only the category changes.');
    expect(screen).toContain("'/api/mpesa/import/recategorise'");
  });
});
