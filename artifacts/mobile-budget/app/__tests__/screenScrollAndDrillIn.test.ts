import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
const reports = readFileSync('app/(tabs)/reports.tsx', 'utf8');
const scrollReset = readFileSync('components/PageScrollReset.tsx', 'utf8');
const variance = readFileSync('components/ContributionVariance.tsx', 'utf8');

describe('Bank accounts scrolls as one page', () => {
  // The balance, the account chips and the five actions were pinned above the
  // transaction list, so the top of the screen could never be scrolled away
  // and the list itself was left a narrow strip.
  it('puts the balance panel inside the list rather than above it', () => {
    const header = bank.slice(bank.indexOf('ListHeaderComponent={'), bank.indexOf('ListFooterComponent={'));
    expect(header).toContain('<LinearGradient');
    expect(header).toContain('</LinearGradient>');
    expect(header).toContain('TRANSACTIONS');
  });

  it('no longer renders the gradient as a sibling of the list', () => {
    const beforeList = bank.slice(bank.indexOf('return ('), bank.indexOf('<PageFlatList'));
    expect(beforeList).not.toContain('<LinearGradient');
  });
});

describe('the banking sheets fit on the screen', () => {
  // The wrapper pins a sheet to the bottom of the screen. With no ceiling, a
  // form taller than the screen grew upwards past the top edge — amount, date
  // and the account it applies to were cut off with no way to reach them.
  it('caps every sheet and lets its body scroll', () => {
    expect(bank).toContain("maxHeight: '88%'");
    // All three banking sheets share the style, and each scrolls.
    expect(bank.match(/styles\.sheet,/g)?.length).toBe(3);
    expect(bank.match(/<ScrollView showsVerticalScrollIndicator=\{false\} keyboardShouldPersistTaps="handled">/g)?.length).toBe(2);
    expect(bank).toContain('keyboardShouldPersistTaps="handled"');
  });

  it('keeps taps working while the keyboard is up', () => {
    // Without this a tap on Save is swallowed dismissing the keyboard.
    expect(bank.match(/keyboardShouldPersistTaps="handled"/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Reports summary cards', () => {
  // Only "Categories to watch" was pressable; the other two read as dead tiles.
  it('makes all three cards pressable', () => {
    const cards = reports.slice(reports.indexOf('styles.progressStats'), reports.indexOf('Overall budget utilisation'));
    expect(cards).not.toContain('<View style={[styles.progressStat,');
    expect(cards.match(/onPress=\{\(\) => /g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('sends each card to the section it summarises', () => {
    expect(reports).toContain("jumpToSection('spending')");
    expect(reports).toContain("jumpToSection('income')");
    expect(reports).toContain("onLayout={captureSection('income')}");
    expect(reports).toContain("onLayout={captureSection('spending')}");
  });

  it('scrolls through a forwarded ref, keeping the focus reset intact', () => {
    expect(reports).toContain('ref={scrollRef}');
    expect(scrollReset).toContain('React.forwardRef<ScrollView, ScrollViewProps>');
    // Both handles must reach the node: ours resets on focus, the caller's scrolls.
    expect(scrollReset).toContain('const setRef = useCallback((node: ScrollView | null) => {');
    expect(scrollReset).toContain("ref.current?.scrollTo({ x: 0, y: 0, animated: false });");
  });
});

describe('the exact-date control on Expected vs actual', () => {
  // An 11px bare calendar among the 3m/6m/12m pills was mistaken for not
  // being there at all.
  it('is labelled rather than a bare icon', () => {
    const control = variance.slice(variance.indexOf('contribution-variance-custom-range'), variance.indexOf('</Pressable>', variance.indexOf('contribution-variance-custom-range')));
    expect(control).toContain('Dates');
    expect(control).toContain('size={13}');
    expect(control).not.toContain('size={11}');
  });

  // Labelling the pills made them wide enough to starve the heading beside
  // them: "Expected vs actual" wrapped one letter per line, and the summary
  // under it became a vertical column of fragments.
  it('sits on its own line rather than beside the heading', () => {
    const header = variance.slice(variance.indexOf('<View style={styles.headRight}>'), variance.indexOf('</Pressable>', variance.indexOf('<View style={styles.headRight}>')));
    expect(header).not.toContain('styles.ranges');
    // The row is emitted after the header, not inside it.
    expect(variance.indexOf('<View style={styles.ranges}>')).toBeGreaterThan(variance.indexOf('</Pressable>'));
  });

  it('keeps the heading from being squeezed narrower than its own words', () => {
    // minWidth 0 is the flex rule that actually prevents it; without it a
    // flex child yields to whatever grows beside it.
    expect(variance).toContain("headerText: { flex: 1, minWidth: 0, gap: 3 }");
    expect(variance).toContain("flexShrink: 1, minWidth: 0 }");
    expect(variance).toContain("headRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }");
  });

  it('lets the pills wrap instead of overflowing a narrow phone', () => {
    expect(variance).toContain("flexWrap: 'wrap'");
  });

  it('has a real touch target and an accessible name', () => {
    expect(variance).toContain("customRangeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28 }");
    expect(variance).toContain('accessibilityLabel="Pick an exact date range"');
  });
});
