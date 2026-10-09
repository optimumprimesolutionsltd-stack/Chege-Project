/**
 * Teach Jamvi your M-Pesa: the onboarding step that uses everything Jamvi
 * already knows, and asks only about what it cannot work out.
 *
 * "Gather all knowledge the app has been improving on and ensure it's utilized
 * well during onboarding so the user can rest during usage" (9 Oct 2026).
 *
 * Jamvi already files a great deal by itself: airtime, bundles and Home Fibre
 * (mpesaProducts), Fuliza, M-Shwari, KCB M-PESA and Hustler Fund loans and
 * savings, M-Pesa's own charges, payees it recognises (knownPayees), payees
 * the person taught it before (payeeLearning) and their own accounts by number
 * (below). What is left is the people, banks and businesses only the person
 * can name. Their regulars - the payees behind most of the lines - are asked
 * about one at a time, once, and each answer goes where the daily M-Pesa SMS
 * reading already looks:
 *
 * - a category  -> a payee rule (by account, till/paybill or name)
 * - an income source for money in -> a source rule
 * - "My own account" -> the account's number on the bank account itself, on
 *   the server, so every payment to it is a move between the person's own
 *   accounts, on every phone, and after a reinstall. A business's account is
 *   linked to the business the same way Bank links it.
 */
import { chooseTransfer, isBankPayee, NOT_SURE_CATEGORY, type Choice, type PreviewLine } from './mpesaImport';
import { knownPayeeOf } from './knownPayees';
import { loanOf, productOf, savingsOf } from './mpesaProducts';
import { looksLikePerson, payeeKey, payeeName, referenceOf, ruleCategory, ruleSource, sourceRuleKey, type PayeeRules } from './payeeLearning';

export type TeachKind = 'person' | 'bank' | 'business';

/** One regular: every line to or from the same payee, asked about once. */
export type TeachGroup = {
  /** '#ref:<account>' for a bank account paid through a paybill, else the payee's key. */
  key: string;
  label: string;
  kind: TeachKind;
  direction: 'out' | 'in';
  /** The account number a bank payment went to, '' when it named none. */
  reference: string;
  count: number;
  total: number;
  indexes: number[];
  /** A line to stand for the group, for the rules kept from an answer. */
  sample: PreviewLine;
};

type Account = { id: number; name: string; accountNumber?: string | null };

const digitsOf = (text: string | null | undefined): string => (text ?? '').replace(/\D/g, '');
/** Long enough to be an account number rather than a short code or a typo. */
const ACCOUNT_DIGITS = 5;

/** The person's own account a line paid into or came from, by the number M-Pesa wrote for it. */
export function ownAccountFor(line: Pick<PreviewLine, 'description'>, accounts: readonly Account[]): Account | null {
  const reference = referenceOf(line.description ?? '');
  if (reference.length < ACCOUNT_DIGITS) return null;
  return accounts.find((account) => digitsOf(account.accountNumber) === reference) ?? null;
}

/**
 * Lines to or from one of the person's own accounts become a move to that
 * account, already checked. Nothing the person chose themselves is touched.
 */
export function withOwnAccounts(
  lines: readonly PreviewLine[],
  choices: Record<number, Choice>,
  accounts: readonly Account[],
): Record<number, Choice> {
  if (!accounts.some((account) => digitsOf(account.accountNumber).length >= ACCOUNT_DIGITS)) return choices;
  let next = choices;
  for (const line of lines) {
    const choice = next[line.index];
    if (!choice?.include || !line.direction || choice.transferTo || choice.otherBudget || choice.savingsGoalId) continue;
    // Something already said what it was: a category kept, or a source for money in.
    if (line.direction === 'out' && choice.confirmed && choice.category !== NOT_SURE_CATEGORY) continue;
    if (line.direction === 'in' && choice.incomeSourceId) continue;
    const account = ownAccountFor(line, accounts);
    if (!account) continue;
    next = chooseTransfer(next, line.index, account.id);
    next = { ...next, [line.index]: { ...next[line.index], confirmed: true } };
  }
  return next;
}

const paidToPerson = (line: PreviewLine): boolean =>
  line.type === 'person_payment' || line.type === 'person_receipt' || (line.type === null && looksLikePerson(line.description ?? ''));

export function kindOf(line: PreviewLine): TeachKind {
  const description = line.description ?? '';
  if (isBankPayee(description)) return 'bank';
  return paidToPerson(line) ? 'person' : 'business';
}

/** Lines Jamvi files by itself, which nobody needs to be asked about. */
const filedByItself = (line: PreviewLine): boolean =>
  Boolean(loanOf(line) || savingsOf(line) || productOf(line))
  || line.type === 'transaction_charge' || line.type === 'fuliza_fee';

/** Whether a line still waits for what only the person can say. */
function unanswered(line: PreviewLine, choice: Choice | undefined, rules: PayeeRules): boolean {
  if (!choice?.include || line.status !== 'ready' || !line.direction || !line.description || line.named === false) return false;
  if (choice.transferTo || choice.otherBudget || choice.savingsGoalId || choice.contributorId || choice.debt) return false;
  if (filedByItself(line)) return false;
  if (line.direction === 'out') {
    // Checked already (a payee Jamvi knows), or chosen by the person.
    if (choice.confirmed || choice.auto === false) return false;
    return !ruleCategory(line.description, rules, line.payeeNumber);
  }
  // Money in from people and banks starts checked as Not sure (no source):
  // that is exactly what to ask about.
  if (choice.incomeSourceId) return false;
  return ruleSource(line.description, rules) === null;
}

function groupKey(line: PreviewLine): string {
  const description = line.description ?? '';
  const reference = referenceOf(description);
  if (isBankPayee(description) && reference.length >= 4) return `#ref:${reference}`;
  return `${line.direction}:${line.direction === 'in' ? sourceRuleKey(description) : payeeKey(description)}`;
}

/**
 * The regulars to ask about, most lines first: payees with at least
 * `minCount` lines still waiting for the person, up to `limit` of them.
 * A payee already answered (confirmed, a rule, a move) drops off by itself,
 * so the list shrinks as the person answers.
 */
export function teachableGroups(
  lines: readonly PreviewLine[],
  choices: Record<number, Choice>,
  rules: PayeeRules = {},
  { limit = 12, minCount = 2, skipped = new Set<string>() }: { limit?: number; minCount?: number; skipped?: ReadonlySet<string> } = {},
): TeachGroup[] {
  const groups = new Map<string, TeachGroup>();
  for (const line of lines) {
    if (!unanswered(line, choices[line.index], rules)) continue;
    const key = groupKey(line);
    if (skipped.has(key)) continue;
    const found = groups.get(key);
    if (found) {
      found.count += 1;
      found.total += Math.abs(line.amount ?? 0);
      found.indexes.push(line.index);
      continue;
    }
    const description = line.description ?? '';
    groups.set(key, {
      key,
      label: payeeName(description.replace(/^Received from\s+/i, '')) || description,
      kind: kindOf(line),
      direction: line.direction as 'out' | 'in',
      reference: isBankPayee(description) ? referenceOf(description) : '',
      count: 1,
      total: Math.abs(line.amount ?? 0),
      indexes: [line.index],
      sample: line,
    });
  }
  return [...groups.values()]
    .filter((group) => group.count >= minCount)
    .sort((a, b) => b.count - a.count || b.total - a.total)
    .slice(0, limit);
}

/** Can this regular be one of the person's own accounts? Only a bank account it named by number. */
export const mayBeOwnAccount = (group: TeachGroup): boolean => group.kind === 'bank' && group.reference.length >= ACCOUNT_DIGITS;

/** Every line of the regular under this category, checked and remembered. */
export function teachCategory(choices: Record<number, Choice>, group: TeachGroup, category: string): Record<number, Choice> {
  const next = { ...choices };
  for (const index of group.indexes) {
    if (!next[index]) continue;
    next[index] = { ...next[index], category, auto: false, confirmed: true, remember: true };
  }
  return next;
}

/** Every line of a regular payer from this income source, checked. */
export function teachSource(choices: Record<number, Choice>, group: TeachGroup, incomeSourceId: number): Record<number, Choice> {
  const next = { ...choices };
  for (const index of group.indexes) {
    if (!next[index]) continue;
    next[index] = { ...next[index], incomeSourceId, sourceAuto: false, confirmed: true, remember: true };
  }
  return next;
}

/** Every line of the regular a move to or from the person's own account, checked. */
export function teachOwnAccount(choices: Record<number, Choice>, group: TeachGroup, accountId: number): Record<number, Choice> {
  let next = choices;
  for (const index of group.indexes) {
    if (!next[index]) continue;
    next = chooseTransfer(next, index, accountId);
    next = { ...next, [index]: { ...next[index], confirmed: true } };
  }
  return next;
}

/** Categories that suit a regular of this kind, from the budget's own: offered first. */
const PERSON_WORDS = /\b(family|support|parents?|mum|mom|dad|children|kids|rent|house ?help|wages|salary|gifts?|school|fees|allowance|pocket)\b/i;

export function suggestedCategories(group: TeachGroup, categoryNames: readonly string[], current: string | undefined, max = 4): string[] {
  const picks: string[] = [];
  if (current && current !== NOT_SURE_CATEGORY) picks.push(current);
  if (group.kind === 'person') {
    for (const name of categoryNames) if (PERSON_WORDS.test(name) && !picks.includes(name)) picks.push(name);
  }
  return picks.slice(0, max);
}

/** What Jamvi filed by itself in this read, in words, most first. */
export type Known = { filed: number; of: number; parts: Array<{ label: string; count: number }> };

export function alreadyKnown(
  lines: readonly PreviewLine[],
  choices: Record<number, Choice>,
  rules: PayeeRules = {},
): Known {
  const counts = new Map<string, number>();
  let of = 0;
  let filed = 0;
  const add = (label: string) => { counts.set(label, (counts.get(label) ?? 0) + 1); filed += 1; };
  for (const line of lines) {
    const choice = choices[line.index];
    if (!choice?.include || line.status !== 'ready' || !line.direction) continue;
    of += 1;
    if (loanOf(line)) add('Fuliza & loans');
    else if (savingsOf(line)) add('Savings');
    else if (productOf(line)) add('Airtime & bundles');
    else if (line.type === 'transaction_charge' || line.type === 'fuliza_fee') add('M-Pesa charges');
    else if (choice.transferTo) add('Your own accounts');
    else if (line.description && line.direction === 'out' && ruleCategory(line.description, rules, line.payeeNumber)) add('Payees you taught it');
    else if (line.description && line.direction === 'in' && ruleSource(line.description, rules) !== null) add('Payees you taught it');
    else if (choice.confirmed && line.description && knownPayeeOf(line.description)) add('Shops & bills it knows');
  }
  return {
    filed,
    of,
    parts: [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
  };
}
