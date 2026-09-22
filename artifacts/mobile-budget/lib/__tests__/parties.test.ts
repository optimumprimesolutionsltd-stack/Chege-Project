import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const parties = readFileSync('app/parties.tsx', 'utf8');
const settings = readFileSync('app/(tabs)/settings.tsx', 'utf8');
const help = readFileSync('lib/helpTopics.ts', 'utf8');

// Creditors and debtors existed — a party with owedByUs is a creditor, KCB as
// much as Mwangi — but they could only be made inside the banking sheet at the
// moment of a posting, and afterwards there was nowhere to see them or correct
// a figure. An opening balance typed wrong stayed wrong.
describe('a screen for everybody money stands between you and', () => {
  it('is reachable without a posting in hand', () => {
    expect(settings).toContain('testID="open-parties"');
    expect(settings).toContain("router.push('/parties')");
  });

  it('lists both directions under the words people use', () => {
    expect(parties).toContain('YOU OWE THEM — CREDITORS');
    expect(parties).toContain('THEY OWE YOU — DEBTORS');
    expect(parties).toContain('NO BALANCE TRACKED');
  });

  it('adds up each direction without netting them', () => {
    expect(parties).toContain('testID="parties-totals"');
    expect(parties).toContain('testID="parties-net"');
    // The net is shown because it is the question people ask, and stored
    // nowhere, because a single signed figure hides both sides.
    expect(parties).not.toContain('netBalance:');
  });

  it('says something useful when nobody is recorded', () => {
    expect(parties).toContain('testID="parties-empty"');
  });
});

describe('somebody can be a creditor and a debtor at once', () => {
  it('takes both balances on one person', () => {
    // The schema has always had two columns rather than one signed number: a
    // chama member can owe the kitty and be owed by it at the same time.
    expect(parties).toContain('testID="parties-draft-owed-by-us"');
    expect(parties).toContain('testID="parties-draft-owed-to-us"');
    expect(parties).toContain('I owe them');
    expect(parties).toContain('They owe me');
  });

  it('shows both figures when both are set', () => {
    expect(parties).toContain('testID={`parties-both-${party.id}`}');
  });

  it('lists them under both headings rather than picking one', () => {
    expect(parties).toContain("const creditors = parties.filter((party) => typeof party.owedByUs === 'number');");
    expect(parties).toContain("const debtors = parties.filter((party) => typeof party.owedToUs === 'number');");
  });
});

describe('an opening balance can be set, and corrected afterwards', () => {
  it('can be typed when somebody is first recorded', () => {
    expect(parties).toContain('testID="parties-add"');
    expect(parties).toContain("method: 'POST',");
  });

  it('can be changed later, which is what was missing', () => {
    expect(parties).toContain('testID={`parties-row-${party.id}`}');
    expect(parties).toContain("method: 'PATCH',");
    expect(parties).toContain('const startEdit = (party: Party) => {');
  });

  it('tells blank from zero', () => {
    // Blank stops tracking; zero is a balance that is tracked and settled,
    // which is worth being able to say and worth seeing.
    expect(parties).toContain("if (value.trim() === '') return null;");
    expect(parties).toContain('Blank is not the same as zero.');
  });

  it('sends both directions every time, so clearing one really clears it', () => {
    expect(parties).toContain('const body = JSON.stringify({ name, kind: draftKind, owedByUs, owedToUs });');
  });

  it('takes the cents the column now holds', () => {
    expect(parties).toContain("import { readAmount, toMoney } from '@/lib/bankAmount';");
    expect(parties).toContain('return toMoney(parsed);');
  });

  it('refuses a negative in either direction', () => {
    expect(parties).toContain('if (parsed === null || parsed < 0)');
  });

  it('can say somebody is a bank rather than a person', () => {
    expect(parties).toContain('testID={`parties-draft-kind-${kind}`}');
    expect(parties).toContain("(['person', 'institution'] as const)");
  });

  it('is in the guide', () => {
    expect(help).toContain('See everybody you owe, and everybody who owes you');
  });
});

// Borrow from Mwangi on the Banking tab and he becomes a creditor; lend to
// Kamau and he becomes a debtor. Both are the same thing the Debt tab is
// about, and neither reached it: the screen read only categories, so a
// household could owe three people and be told "no debts tracked yet".
describe('borrowing and lending reach the Debt tab', () => {
  const debt = readFileSync('app/(tabs)/debt.tsx', 'utf8');

  it('reads the parties, not only the categories', () => {
    expect(debt).toContain("queryKey: ['parties'],");
    expect(debt).toContain('testID="debt-parties"');
  });

  it('lists both directions, and says which is which', () => {
    expect(debt).toContain('testID={`debt-creditor-${party.id}`}');
    expect(debt).toContain('testID={`debt-debtor-${party.id}`}');
    expect(debt).toContain('You owe them');
    expect(debt).toContain('Owes you');
  });

  it('leaves out balances that are settled', () => {
    // Zero is a tracked balance worth seeing on the parties screen, and noise
    // on a screen about what is still outstanding.
    expect(debt).toContain("typeof party.owedByUs === 'number' && (party.owedByUs ?? 0) > 0");
  });

  it('stops saying nothing is tracked when people are owed', () => {
    expect(debt).toContain('You owe KES ${kes(owedToPeople)} to people and institutions, below.');
  });

  it('keeps them out of the payoff plan, and says why', () => {
    // The plan needs a monthly amount to reach an end date; a party has none,
    // so including them would replace every date with "no end date yet".
    expect(debt).toContain('works out an end date from a monthly amount, and these have none');
  });

  it('links to where the balances are corrected', () => {
    expect(debt).toContain('testID="debt-open-parties"');
    expect(debt).toContain("router.push('/parties')");
  });
});
