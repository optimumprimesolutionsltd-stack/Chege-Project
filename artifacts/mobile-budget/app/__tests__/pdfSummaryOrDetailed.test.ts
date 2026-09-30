import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(__dirname, '..', '..', path), 'utf8');

// A grouped PDF asks first: each group's total, or every entry under it.
describe('a PDF of a grouped list, as a summary or detailed', () => {
  it('asks on All expenses when shown by category or item, never by date', () => {
    const screen = read('app/expense-ledger.tsx');
    expect(screen).toContain("onPress={() => (view === 'date' ? void downloadPdf() : askPdfDetail(");
    expect(screen).toContain("expensesGroupBy: view, expensesDetail: detail ?? 'detailed'");
  });

  it('gives All income a PDF, asking when shown by income stream', () => {
    const screen = read('app/income-ledger.tsx');
    expect(screen).toContain('testID="income-ledger-pdf"');
    expect(screen).toContain("askPdfDetail('income stream'");
    expect(screen).toContain("incomeGroupBy: 'stream' as const, incomeDetail: detail ?? 'detailed'");
    expect(screen).toContain('includeIncomeEntries: true');
  });

  it('offers Summary and Detailed, and a way out', () => {
    const ask = read('lib/pdfDetail.ts');
    expect(ask).toContain("'Summary or detailed?'");
    expect(ask).toContain("{ text: 'Cancel', style: 'cancel' }");
    expect(ask).toContain("choose('summary')");
    expect(ask).toContain("choose('detailed')");
  });
});

// A long list gets a thumb to drag; scrolling never re-renders the list.
describe('the scroller on Bank', () => {
  it('is asked for by Bank, clear of the header and the floating buttons', () => {
    expect(read('app/(tabs)/bank.tsx')).toContain("scroller={{ top: topPad + 12, bottom: (Platform.OS === 'web' ? 100 : insets.bottom + 110) }}");
  });

  it('drags the list and follows it through an animated value, only on a long list', () => {
    const list = read('components/PageScrollReset.tsx');
    expect(list).toContain('testID="page-scroller"');
    expect(list).toContain('ref.current?.scrollToOffset({ offset: (top / room) * Math.max(0, content - height), animated: false });');
    expect(list).toContain('offset.setValue(event.nativeEvent.contentOffset.y);');
    expect(list).toContain('sizes.content > sizes.height * SCROLLER_MIN_SCREENS');
    expect(list).toContain('if (!scroller) return <FlatList ref={ref} {...props} />;');
  });
});
