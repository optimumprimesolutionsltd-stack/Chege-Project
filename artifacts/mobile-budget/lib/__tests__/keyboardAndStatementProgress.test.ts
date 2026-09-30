import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('components/PageScrollReset.tsx', 'utf8');
const mpesa = readFileSync('app/mpesa-import.tsx', 'utf8');
const reader = readFileSync('lib/statementReaderHtml.ts', 'utf8');

// The keyboard covered whatever was being typed into, on every page: the page
// did not move, so a password or an amount near the bottom was typed blind.
describe('pages move clear of the keyboard', () => {
  it('scrolls the focused field above the keyboard on a phone', () => {
    expect(page).toContain("import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';");
    expect(page).toContain('bottomOffset={KEYBOARD_GAP}');
  });

  it('keeps taps on buttons working while typing', () => {
    expect(page).toContain('keyboardShouldPersistTaps="handled"');
  });

  it('keeps the plain scroll view on the web, where there is no such keyboard', () => {
    expect(page).toContain("const list = Platform.OS !== 'web' ? (");
    expect(page).toContain(') : <ScrollView ref={setRef} {...props} {...listProps} />;');
  });
});

describe('the statement password can be checked before reading', () => {
  it('can be shown and hidden', () => {
    expect(mpesa).toContain('secureTextEntry={!showStatementPassword}');
    expect(mpesa).toContain('testID="mpesa-statement-password-toggle"');
  });

  it('goes back to hidden once the statement is read', () => {
    expect(mpesa).toContain("setStatementPassword('');\n      setShowStatementPassword(false);".replace(/\n/g, mpesa.includes('\r\n') ? '\r\n' : '\n'));
  });
});

// A long statement looked frozen: one spinner from choosing the file to the list.
describe('reading and saving a statement shows how far along it is', () => {
  it('reports each page as it is read', () => {
    expect(reader).toContain("post({ type: 'progress', page: number, of: doc.numPages });");
  });

  it('says which stage it is at', () => {
    expect(mpesa).toContain("'Opening your statement…'");
    expect(mpesa).toContain('`Reading page ${readProgress.page} of ${readProgress.of}…`');
    expect(mpesa).toContain("'Checking which of these are already recorded…'");
  });

  it('does not treat a progress report as the result', () => {
    expect(mpesa).toContain("if (result.type === 'progress') {");
  });

  it('shows a bar while saving, and asks to keep the app open', () => {
    expect(mpesa).toContain('testID="mpesa-save-progress-bar"');
    expect(mpesa).toContain('Keep Jamvi open until it finishes.');
  });
});

// "Want to see a percentage", and "the statement is taking long": a read was
// one spinner, and the reader's 1.8 MB library only started loading on Read.
describe('reading a statement is quicker and says how far along it is', () => {
  const component = readFileSync('components/StatementReader.tsx', 'utf8');

  it('shows a percentage across all three stages, pages taking most of the bar', async () => {
    const { readPercent } = await import('../statementProgress');
    expect(readPercent({ stage: 'opening' })).toBe(5);
    expect(readPercent({ stage: 'reading', page: 0, of: 12 })).toBe(10);
    expect(readPercent({ stage: 'reading', page: 6, of: 12 })).toBe(50);
    expect(readPercent({ stage: 'reading', page: 12, of: 12 })).toBe(90);
    expect(readPercent({ stage: 'checking' })).toBe(95);
  });

  it('shows a percentage while saving too', () => {
    expect(mpesa).toContain('Math.round((saveProgress.done / saveProgress.total) * 100)}%');
  });

  it('starts loading the reader as soon as a statement is chosen', () => {
    expect(mpesa).toContain('warm={statementFile !== null}');
    expect(component).toContain('const wanted = job !== null || warm;');
    expect(reader).toContain('const loading = (async () => {');
    expect(reader).toContain('await loading;');
  });

  it('still sends the file and password in only when Read is tapped, once each', () => {
    expect(component).toContain('if (!current || !pageReady.current || sentJob.current === current) return;');
  });

  it('ignores what a warming page says while nobody is waiting', () => {
    expect(component).toContain('if (!jobRef.current) return;');
  });

  it('closes the keyboard so the progress under the button can be seen', () => {
    expect(mpesa).toContain('Keyboard.dismiss();');
  });

  it('gives up on a read that goes quiet, but never on one still moving', () => {
    expect(mpesa).toContain('const READ_STALL_MS = 90_000;');
    const progress = mpesa.slice(mpesa.indexOf("if (result.type === 'progress') {"));
    expect(progress.slice(0, 200)).toContain('armReadStall();');
  });
});
