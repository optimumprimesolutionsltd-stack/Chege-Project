import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HELP_SECTIONS, allHelpTopics, searchHelp } from '../helpTopics';

const screen = readFileSync('app/help.tsx', 'utf8');
const settings = readFileSync('app/(tabs)/settings.tsx', 'utf8');
const layout = readFileSync('app/_layout.tsx', 'utf8');

// The app had no answer anywhere to "where do I go to do what". The guides on
// the website are marketing pieces and none of them names a button.
describe('the guide covers the app', () => {
  it('answers the questions somebody actually arrives with', () => {
    const questions = allHelpTopics().map((topic) => topic.question.toLocaleLowerCase());
    for (const asked of ['bank account', 'savings goal', 'statement', 'category', 'debt']) {
      expect(questions.some((question) => question.includes(asked))).toBe(true);
    }
  });

  it('names controls in the words printed on the screen', () => {
    // A guide that paraphrases is one you still have to translate.
    const steps = allHelpTopics().flatMap((topic) => topic.steps).join(' ');
    for (const label of [
      'Save and add another',
      'Check against statement',
      'Edit starting balance',
      'A group of categories',
      'Inside another category',
    ]) {
      expect(steps).toContain(label);
    }
  });

  it('sends debt work to the Debt tab, which can do it', () => {
    // An earlier version of this guide said debts could only be managed on a
    // laptop. The phone has had a full editor all along, in a component the
    // Debt tab renders — so the guide was sending people away for no reason.
    const debts = allHelpTopics().filter((topic) => (topic.keywords ?? []).includes('debt'));
    expect(debts.length).toBeGreaterThan(0);
    for (const topic of debts) {
      expect(topic.steps.join(' ')).not.toContain('laptop');
      expect(topic.route).toBeTruthy();
    }
  });

  it('explains that a debt payment is offered rather than applied', () => {
    const paying = allHelpTopics().find((topic) => topic.question.includes('Pay a debt'));
    expect(paying?.steps.join(' ')).toContain('asks whether to take that much off');
  });

  it('gives every topic somewhere to go, or a reason it has nowhere', () => {
    // A topic with no route is one that is not a single place — arithmetic in
    // an amount field, or a rule about headings.
    for (const topic of allHelpTopics()) {
      expect(topic.steps.length).toBeGreaterThan(0);
      if (topic.route) expect(topic.route.startsWith('/')).toBe(true);
    }
  });
});

describe('searching it', () => {
  it('finds a topic by a word from the screen, not just its title', () => {
    // People search for what is in front of them when they are stuck.
    expect(searchHelp('reconcile').length).toBeGreaterThan(0);
    expect(searchHelp('arrears').length).toBeGreaterThan(0);
    expect(searchHelp('calculator').length).toBeGreaterThan(0);
  });

  it('matches regardless of case or stray spaces', () => {
    expect(searchHelp('  STATEMENT ').length).toBeGreaterThan(0);
  });

  it('returns everything when nothing is typed', () => {
    expect(searchHelp('')).toEqual(HELP_SECTIONS);
  });

  it('drops sections that have no match rather than showing empty headings', () => {
    for (const section of searchHelp('savings goal')) {
      expect(section.topics.length).toBeGreaterThan(0);
    }
  });

  it('finds nothing for nonsense, and says so', () => {
    expect(searchHelp('qwertyuiop')).toEqual([]);
    expect(screen).toContain('testID="help-no-match"');
  });
});

describe('reaching it', () => {
  it('sits in Settings, where somebody stuck would look', () => {
    expect(settings).toContain('testID="open-help"');
    expect(settings).toContain("router.push('/help')");
  });

  it('is registered as its own screen', () => {
    expect(layout).toContain('<Stack.Screen name="help"');
  });

  it('opens collapsed, so the whole map is visible at once', () => {
    // Seeing that a thing exists is most of what this screen is for.
    expect(screen).toContain('const [open, setOpen] = useState(false);');
  });

  it('takes you to the screen rather than only describing it', () => {
    expect(screen).toContain('testID={`help-go-${index}`}');
    expect(screen).toContain('router.push(topic.route as never)');
  });
});

// The guide shipped into Settings alone, which is where you go when you know
// what you want — not when you are lost. Nobody would find it.
describe("being found", () => {
  const bank = readFileSync("app/(tabs)/bank.tsx", "utf8");
  const budget = readFileSync("app/(tabs)/budget.tsx", "utf8");
  const button = readFileSync("components/HelpButton.tsx", "utf8");

  it("sits on the screens themselves, not only in Settings", () => {
    expect(bank).toContain('<HelpButton about="bank" />');
    expect(budget).toContain('<HelpButton about="category" />');
  });

  it("carries the screen with it", () => {
    expect(button).toContain("router.push({ pathname: '/help', params: { about } })");
  });

  it("opens already filtered to what you were looking at", () => {
    // Somebody stuck is stuck on something particular; making them search for
    // its name first is the same as not helping.
    expect(screen).toContain("const { about } = useLocalSearchParams<{ about?: string }>();");
    expect(screen).toContain("useState(typeof about === 'string' ? about : '')");
  });

  it("still opens on everything when reached from Settings", () => {
    // No parameter, no filter.
    expect(screen).toContain("searchHelp(query)");
  });
});
