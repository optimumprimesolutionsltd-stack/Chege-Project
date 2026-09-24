import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('components/ContributionExport.tsx', 'utf8').replace(/\r\n/g, '\n');
const download = source.slice(source.indexOf('const downloadPdf'), source.indexOf('const shareToWhatsApp'));
const share = source.slice(source.indexOf('const shareToWhatsApp'), source.indexOf('return (\n    <View style={[styles.card'));

// "Monthly grid" used to download and share the dated ledger regardless of
// the mode chosen, so the expected-versus-given sheet could never be produced.
describe('Monthly grid exports the grid, not the ledger', () => {
  it('downloads report.pdf for the chosen months in grid mode, statement.pdf otherwise', () => {
    expect(download).toContain("mode === 'grid'");
    expect(download).toContain('/api/contributions/report.pdf?months=${months}');
    expect(download).toContain('/api/contributions/statement.pdf?${pdfQuery}');
  });
  it('shares the grid summary text in grid mode', () => {
    expect(share).toContain("mode === 'grid'");
    expect(share).toContain('buildWhatsAppText(');
    expect(share).toContain('buildStatementText(');
  });
  it('only offers the ledger PDF section toggles in ledger mode', () => {
    expect(source).toContain("{mode === 'ledger' ? (\n      <View style={styles.sections}>");
  });
});
