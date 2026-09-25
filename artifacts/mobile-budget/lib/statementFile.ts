import { File } from 'expo-file-system';

type Picker = {
  getDocumentAsync: (options: { type: string; copyToCacheDirectory: boolean }) => Promise<{
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

/** True on a build that can choose a statement and read it. */
export const canReadStatements = picker !== null && webViewAvailable;

export interface ChosenStatement {
  name: string;
  uri: string;
}

/** Lets the person choose the statement PDF. Null when they back out. */
export async function chooseStatement(): Promise<ChosenStatement | null> {
  if (!picker) return null;
  const result = await picker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
  const asset = result.canceled ? null : result.assets?.[0];
  return asset ? { name: asset.name, uri: asset.uri } : null;
}

/** The file's bytes, as text the reader page can turn back into a PDF. */
export const statementBase64 = (uri: string): Promise<string> => new File(uri).base64();

