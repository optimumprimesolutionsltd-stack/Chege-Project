import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const home = readFileSync('app/(tabs)/index.tsx', 'utf8');

describe('mobile Ask Jamvi entry point', () => {
  it('explains Ask Jamvi as a read-only whole-budget assistant, opened from the header', () => {
    // The full card further down Home became a header button (9 Oct 2026 cleanup);
    // the explanation moved into the sheet it opens.
    expect(home).not.toContain('testID="ask-jamvi-cta"');
    expect(home).toContain('Ask about anything in this budget: spending, bank accounts, income, goals, activity, categories, or reports.');
    expect(home).toContain('Jamvi explains your numbers but cannot change records or move money.');
    expect(home).toContain('testID="open-ask-jamvi"');
    expect(home).toContain('onPress={openAskJamvi}');
  });

  it('sends the active month and year to the read-only Ask Jamvi endpoint', () => {
    expect(home).toContain("customFetch<AskResponse>('/api/ai/ask'");
    expect(home).toContain('JSON.stringify({ question, month, year, history })');
    expect(home).toContain('Read-only · {askAnswer.workspaceScoped ?');
  });
});

// Ask Jamvi answers from the app's own screens' figures, keeps the
// conversation for follow-ups while it is open, and links to the screens.
describe('a conversation with Ask Jamvi', () => {
  it('sends the last few questions and answers, so a follow-up is understood', () => {
    expect(home).toContain('const history = previous.slice(-4).flatMap((turn) => [');
  });

  it('keeps the conversation only while the app is open', () => {
    expect(home).toContain('const [askThread, setAskThread] = useState<Array<{ question: string; answer: string }>>([]);');
    expect(home.includes("AsyncStorage.setItem(" + String.fromCharCode(39) + "ask")).toBe(false);
  });

  it('opens the screens an answer used', () => {
    expect(home).toContain('testID="ask-jamvi-links"');
    expect(home).toContain('router.push(link.route as never);');
  });

  it('can start again', () => {
    expect(home).toContain('testID="ask-jamvi-new"');
  });
});
