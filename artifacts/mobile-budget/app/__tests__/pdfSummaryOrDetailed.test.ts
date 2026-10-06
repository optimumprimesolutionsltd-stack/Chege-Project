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

// A long page gets a thumb to drag; scrolling never re-renders the list.
describe('the scroller arrows', () => {
  it('is on every long page, clear of its header and floating buttons', () => {
    expect(read('app/(tabs)/bank.tsx')).toContain("scroller={{ top: topPad + 12, bottom: (Platform.OS === 'web' ? 100 : insets.bottom + 110) }}");
    for (const tab of ['budget', 'contributions', 'debt', 'goals', 'history', 'index', 'reports', 'settings']) {
      expect(read(`app/(tabs)/${tab}.tsx`)).toContain('scroller={{ top: 12, bottom: insets.bottom + 110 }}');
    }
    for (const page of ['expense-ledger', 'income-ledger', 'business', 'spending-by-item']) {
      const screen = read(`app/${page}.tsx`);
      expect(screen).toContain('<ScrollerScrollView scroller={{ top: 8, bottom: insets.bottom + 16 }}');
      expect(screen).toContain('</ScrollerScrollView>');
    }
    expect(read('app/parties.tsx')).toContain('scroller={{ top: 8, bottom: 24 }}');
    expect(read('app/mpesa-import.tsx')).toContain('scroller={{ top: 8, bottom: insets.bottom + 120 }}');
  });

  it('moves a screen per tap and keeps moving while held, only on a long page', () => {
    const hook = read('components/FastScroller.tsx');
    expect(hook).toContain('testID={`page-scroller-${direction}`}');
    expect(hook).toContain('onPressIn={() => pressIn(direction)}');
    expect(hook).toContain('onPressOut={release}');
    // A tap moves the page on touch, not on release.
    expect(hook.replace(/\s+/g, ' ')).toContain("const pressIn = (direction: 'up' | 'down') => { stopGlide(); jump(direction);");
    expect(hook).toContain('glide.frame = requestAnimationFrame(step);');
    expect(hook).toContain('scrollEventThrottle: SCROLL_REPORT_MS,');
    expect(hook).toContain("{!edges.atTop ? arrow('up') : null}");
    expect(hook).toContain('sizes.content > sizes.height * SCROLLER_MIN_SCREENS');
    const lists = read('components/PageScrollReset.tsx');
    expect(lists).toContain('if (!scroller) return <FlatList ref={ref} {...LIST_WINDOW} {...props} />;');
    expect(lists).toContain("(offset, animated) => ref.current?.scrollTo({ y: offset, animated })");
  });
});

// The view buttons light up on the tap; the long list follows.
describe('switching how a ledger is shown', () => {
  it('shows the choice at once and renders the list from a deferred value', () => {
    for (const page of ['expense-ledger', 'income-ledger']) {
      const screen = read(`app/${page}.tsx`);
      expect(screen).toContain('const shownView = useDeferredValue(view);');
      expect(screen).toContain('pressed && !active && { backgroundColor: colors.border }');
    }
    expect(read('app/expense-ledger.tsx')).toContain(") : shownView === 'category' ? (");
    expect(read('app/income-ledger.tsx')).toContain(") : shownView === 'stream' ? (");
  });
});
