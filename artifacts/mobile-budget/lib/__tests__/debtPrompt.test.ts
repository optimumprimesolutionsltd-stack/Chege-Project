import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const card = readFileSync('components/DebtSummaryCard.tsx', 'utf8');
const home = readFileSync('app/(tabs)/index.tsx', 'utf8');
const settings = readFileSync('app/(tabs)/settings.tsx', 'utf8');
const help = readFileSync('lib/helpTopics.ts', 'utf8');

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
    // Three now: the invitation, the summary, and the card for money owed to
    // people when no category is tracked.
    expect((card.match(/router\.push\('\/\(tabs\)\/debt'\)/g) ?? []).length).toBe(3);
  });

  it('names the debts people in Kenya actually carry', () => {
    expect(card).toContain('a bank loan, a SACCO, Fuliza, or money owed to somebody');
  });
});

describe('it can be put away, and got back', () => {
  it('snoozes rather than answering for ever', () => {
    // Sent away for good, a mis-tap would silence the only mention of debt
    // anywhere in the app, with no setting to undo it.
    expect(card).toContain('testID="home-track-debt-dismiss"');
    expect(card).toContain("const SNOOZE_KEY = 'jamvi:debt-prompt-snooze-until';");
    expect(card).toContain('const SNOOZE_DAYS = 90;');
    expect(card).toContain('AsyncStorage.setItem(SNOOZE_KEY, String(until))');
  });

  it('offers the tap straight back', () => {
    // The mis-tap somebody notices at once should not cost them 90 days.
    expect(card).toContain('testID="home-track-debt-undo"');
    expect(card).toContain('AsyncStorage.multiRemove([SNOOZE_KEY, LEGACY_DISMISSED_KEY])');
  });

  it('frees the phones the first version put away for good', () => {
    expect(card).toContain("const LEGACY_DISMISSED_KEY = 'home_debt_prompt_dismissed';");
    expect(card).toContain("legacy === 'true' ? Date.now() + SNOOZE_DAYS * 86_400_000 : 0");
  });

  it('waits to know whether it is snoozed before showing', () => {
    // Unsnoozed and unread are different. Treating unread as unsnoozed flashes
    // the card up and takes it away again on every cold start.
    expect(card).toContain('useState<number | undefined>(undefined)');
    expect(card).toContain('snoozedUntil !== undefined');
    expect(card).toContain('Date.now() >= snoozedUntil');
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
    // A read that throws must not hide the prompt for ever.
    expect(card).toContain('if (active) setSnoozedUntil(0);');
  });
});

// Snoozed for 90 days, with the Debt tab not there either, debt would be
// unmentioned anywhere in the app for a season. Somebody who took a loan in
// the meantime needs a way back that does not depend on being asked.
describe('debt is never entirely out of reach', () => {
  it('keeps a row in Settings that does not come and go', () => {
    expect(settings).toContain('testID="open-debt"');
    expect(settings).toContain("router.push('/(tabs)/debt');");
  });

  it('brings the prompt back when that row is used', () => {
    // Somebody who said "No debt" and then borrowed should be asked again.
    expect(settings).toContain("AsyncStorage.multiRemove(['jamvi:debt-prompt-snooze-until', 'home_debt_prompt_dismissed'])");
  });

  it('says so in the guide, under what somebody would search for', () => {
    expect(help).toContain('Find debt when there is no Debt tab');
    expect(help).toContain("'no debt tab'");
  });
});

// The tab learned that a creditor is a debt, and so did the Debt screen. The
// home card had not: borrowing from Mwangi put a creditor on the books and
// left the home screen silent — or worse, offering to start tracking debt
// that was already tracked.
describe('the home card counts who you owe, not only categories', () => {
  const card = readFileSync('components/DebtSummaryCard.tsx', 'utf8');

  it('reads the parties', () => {
    expect(card).toContain("queryKey: ['parties'],");
    expect(card).toContain('const owedToPeople = parties.reduce(');
  });

  it('shows what is owed when no category is tracked', () => {
    expect(card).toContain('testID="home-debt-parties-card"');
    expect(card).toContain('if (debts.length === 0 && owedToPeople > 0) {');
  });

  it('opens the Debt tab, where something can be done about it', () => {
    expect((card.match(/router\.push\('\/\(tabs\)\/debt'\)/g) ?? []).length).toBe(3);
  });

  it('does not offer to start tracking debt that is already tracked', () => {
    // The invitation branch is only reached once the party total is zero too.
    const order = card.indexOf('if (debts.length === 0 && owedToPeople > 0) {');
    expect(order).toBeGreaterThan(0);
    expect(order).toBeLessThan(card.indexOf('if (debts.length === 0) {'));
  });

  it('adds it alongside when categories are tracked as well', () => {
    expect(card).toContain('testID="home-debt-plus-parties"');
    expect(card).toContain('which has no end date');
  });

  it('never counts a negative or an untracked balance', () => {
    expect(card).toContain('Math.max(0, party.owedByUs ?? 0)');
  });
});
