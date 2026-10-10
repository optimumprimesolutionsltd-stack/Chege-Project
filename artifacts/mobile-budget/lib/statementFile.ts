import { File } from 'expo-file-system';

type Picker = {
  getDocumentAsync: (options: { type: string | string[]; copyToCacheDirectory: boolean }) => Promise<{
    canceled: boolean;
    assets?: Array<{ uri: string; name: string }>;
  }>;
};

/**
 * Choosing and reading a statement PDF, if this build can.
 *
 * The file picker and the hidden web page that reads the PDF need native code,
 * which only a new build carries. An update reaches every installed copy of the
 * app, old builds included, and an old build has no such module: importing it
 * would fail at start. So they are loaded inside a try, and an old build simply
 * does not offer statements.
 */
let picker: Picker | null = null;
let webViewAvailable = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  picker = require('expo-document-picker') as Picker;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  webViewAvailable = typeof (require('react-native-webview') as { WebView?: unknown }).WebView !== 'undefined';
} catch {
  // An older build without the native modules: statements are not offered.
  picker = null;
  webViewAvailable = false;
}

/** Tests stand in for the native picker, which vitest cannot load. */
export function setPickerForTests(next: Picker | null): void {
  picker = next;
}

/** True on a build that can choose a statement and read it. */
export const canReadStatements = picker !== null && webViewAvailable;

export interface ChosenStatement {
  name: string;
  uri: string;
}

/**
 * The kinds of file the picker lets through. A statement saved from WhatsApp
 * or some downloads apps is labelled as a plain file, not a PDF, and was
 * greyed out ("choose the statement pdf ... still slow or not working",
 * 10 Oct 2026). Anything that is not a statement is turned away by the reader
 * ("Is it the M-Pesa statement PDF?").
 */
export const STATEMENT_TYPES = ['application/pdf', 'application/octet-stream', 'application/x-pdf'];

/**
 * Lets the person choose the statement PDF. Null when they back out. A second
 * picker while one is still open (a double tap) is refused by Android; that
 * is not an error to show, the first one is still there.
 */
export async function chooseStatement(): Promise<ChosenStatement | null> {
  if (!picker) return null;
  let result: Awaited<ReturnType<Picker['getDocumentAsync']>>;
  try {
    result = await picker.getDocumentAsync({ type: STATEMENT_TYPES, copyToCacheDirectory: true });
  } catch (error) {
    if (error instanceof Error && /in progress/i.test(error.message)) return null;
    throw error;
  }
  const asset = result.canceled ? null : result.assets?.[0];
  return asset ? { name: asset.name, uri: asset.uri } : null;
}

/** The file's bytes, as text the reader page can turn back into a PDF. */
export const statementBase64 = (uri: string): Promise<string> => new File(uri).base64();

