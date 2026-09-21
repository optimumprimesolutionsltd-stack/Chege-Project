import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const card = readFileSync('components/DebtSummaryCard.tsx', 'utf8');
const home = readFileSync('app/(tabs)/index.tsx', 'utf8');

// The Debt tab appears only once a debt is tracked, and the only places to
// track one were that tab and a tick-box inside the withdraw category
// creator. So the first debt had nowhere to come from: no tab, and nothing on
// any screen saying the app does this at all.
describe('offering to track a first debt', () => {
  it('lives in the card that would otherwise render nothing', () => {
    // Beside it rather than inside it and the home screen could show the
    // summary and the invitation together, which is a contradiction.
    expect(card).toContain('testID="home-track-debt-cta"');
    expect(card).toContain('if (debts.length === 0) {');
  });

  it('sends people to the Debt tab, which by then has a reason to exist', () => {
    expect(card).toContain('testID="home-track-debt"');
    expect((card.match(/router\.push\('\/\(tabs\)\/debt'\)/g) ?? []).length).toBe(2);
  });

  it('names the debts people in Kenya actually carry', () => {
    expect(card).toContain('a bank loan, a SACCO, Fuliza, or money owed to somebody');
  });
});

describe('it does not become furniture', () => {
  it('can be sent away for good', () => {
    expect(card).toContain('testID="home-track-debt-dismiss"');
    expect(card).toContain("const PROMPT_DISMISSED_KEY = 'home_debt_prompt_dismissed';");
    expect(card).toContain("AsyncStorage.setItem(PROMPT_DISMISSED_KEY, 'true')");
  });

  it('waits to know whether it was dismissed before showing', () => {
    // Undismissed and unread are different. Treating unread as undismissed
    // flashes the card up and takes it away again on every cold start.
    expect(card).toContain('useState<boolean | null>(null)');
    expect(card).toContain('promptDismissed === false');
  });

  it('stays quiet on a budget with nothing in it', () => {
    // That screen already carries "No budget yet". Two next steps is neither.
    expect(card).toContain('categories.length > 0');
  });

  it('is never shown to somebody who could not act on it', () => {
    expect(card).toContain('canTrackDebt = false');
    expect(home).toContain('<DebtSummaryCard canTrackDebt={canManageBudget} />');
  });

  it('survives storage that refuses to answer', () => {
    // A read that throws must not leave the card stuck at null for ever.
    expect(card).toContain('.catch(() => setPromptDismissed(false));');
  });
});
