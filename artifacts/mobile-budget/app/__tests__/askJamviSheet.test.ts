import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const home = readFileSync('app/(tabs)/index.tsx', 'utf8');

// "How do I come out of here?" - a long answer pushed the X off the screen.
describe('the Ask Jamvi sheet', () => {
  it('scrolls its answer under a header that stays, and has a Close beside New question', () => {
    expect(home).toContain("<AskScroll style={{ flexShrink: 1 }}");
    expect(home).toContain("maxHeight: '92%'");
    expect(home).toContain('testID="ask-jamvi-close"');
  });
});
