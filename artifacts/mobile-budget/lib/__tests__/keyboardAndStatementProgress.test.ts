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
    expect(page).toContain("if (Platform.OS !== 'web') {");
    expect(page).toContain('return <ScrollView ref={setRef} {...props} />;');
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
