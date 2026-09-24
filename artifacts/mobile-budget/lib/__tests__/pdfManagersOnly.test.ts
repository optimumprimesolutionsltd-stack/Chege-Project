import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe('members never see a PDF button (mobile)', () => {
  it('hides the Reports PDF button and its section checkboxes', () => {
    const reports = read('app/(tabs)/reports.tsx');
    expect(reports).toContain("const canDownloadPdf = group?.isPrivate !== false || group?.role === 'owner' || group?.role === 'admin';");
    expect(reports).toContain('{canDownloadPdf ? (\n            <Pressable\n              onPress={exportPdf}');
    expect(reports).toContain('{canDownloadPdf ? (\n          <View style={styles.pdfSectionsRow}>');
  });
  it('hides Share as PDF on the bank statement', () => {
    const statement = read('app/bank-statement.tsx');
    expect(statement).toContain('{canDownloadPdf ? (\n          <TouchableOpacity\n            onPress={() => void share()}');
  });
});
