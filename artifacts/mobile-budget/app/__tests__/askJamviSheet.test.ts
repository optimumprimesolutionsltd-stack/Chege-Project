import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const home = readFileSync('app/(tabs)/index.tsx', 'utf8');

// "How do I come out of here?" - a long answer pushed the X off the screen.
describe('the Ask Jamvi sheet', () => {
  it('scrolls its answer under a header that stays, and has a Close beside New question', () => {
    expect(home).toContain("<AskScroll style={{ flexShrink: 1 }}");
    expect(home).toContain("maxHeight: '92%'");
    expect(home).toContain('testID="ask-jamvi-hide-answer"');
    expect(home).toContain('numberOfLines={open ? undefined : 3}');
  });
});

// "If you close an open tab it exits the whole Ask Jamvi."
describe('coming back from a screen an answer opened', () => {
  it('reopens Ask Jamvi with the conversation still there', () => {
    expect(home).toContain('onPress={() => { reopenAsk.current = true; setAskOpen(false); router.push(link.route as never); }}');
    expect(home).toContain('if (reopenAsk.current) {');
  });
});
