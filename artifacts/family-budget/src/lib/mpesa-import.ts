import type { DebtLink } from "./mpesa-debts";
import { fuzzyCategory, isFeePosting, looksLikePerson, ruleCategory, ruleSource, wordCategory, type PayeeRules } from "./payee-learning";
import { loanOf, productCategory, productOf, savingsOf } from "./mpesa-products";
import { knownPayeeCategory } from "./known-payees";

export type AlreadyRecorded = {
  date: string | null;
  description: string;
  /** The category it was recorded under, when it is spending. */
  category?: string | null;
  /** True for ordinary spending, whose category can be changed without touching anything else. */
  editable?: boolean;
};

/** One line of the review list, as the API"s preview returns it. */
export type PreviewLine = {
  index: number;
  status: "ready" | "skipped";
  reason: string | null;
  receipt: string | null;
  direction: "out" | "in" | null;
  type: string | null;
  amount: number | null;
  description: string | null;
  /** The name the message gave, kept when the person"s nickname for the payee is shown as the description. */
  original?: string;
  /** False when the message named nobody, so the description is only a generic label. */
  named?: boolean;
  date: string | null;
  fee: number | null;
  mpesaBalance: number | null;
  alreadyRecorded: AlreadyRecorded | null;
  /** The till or paybill number, when the source carries one (a statement does, a message does not). */
  payeeNumber?: string | null;
  /** Another of the person"s budgets that already has this M-Pesa code: saving it here too would count it twice. */
  elsewhere?: string | null;
  /** An entry typed by hand in this budget that looks like the same payment (api-server lib/possible-duplicates). */
  typedTwin?: TypedTwin | null;
};

export type TypedTwin = { description: string; date: string; amount: number };

/**
 * `auto` is true while the category is Jamvi"s suggestion and the person has not chosen one.
 * `debt` links a payment to or from a person to what stands between you.
 */
export type Choice = {
  include: boolean;
  category: string;
  auto?: boolean;
  /**
   * The person has looked at this line and kept it as it is - Jamvi"s suggestion
   * included. A long statement is worked through over days, and only lines the
   * person has confirmed or changed are saved.
   */
  confirmed?: boolean;
  debt?: DebtLink | null;
  /** For money in: which of the person"s income sources it came from. Optional. */
  incomeSourceId?: number | null;
  /** True while that source is Jamvi"s suggestion and the person has not chosen one. */
  sourceAuto?: boolean;
  /**
   * The other of the person"s own accounts, when this line is only money moving
   * between two of them through M-Pesa (a bank paying into M-Pesa, or M-Pesa paying
   * out to another bank). Neither income nor spending.
   */
  transferTo?: number | null;
  /**
   * "Remember this": keep this category for this payee once it is saved. Ticked
   * by itself when the person chooses or confirms a category - the choice is
   * the reason to remember it - and they untick what Jamvi should not learn.
   */
  remember?: boolean;
  /**
   * A savings goal, when this line is money going into savings (out of M-Pesa) or coming
   * back out of it (into M-Pesa). Neither spending nor income.
   */
  savingsGoalId?: number | null;
  /**
   * In a shared group: whose contribution this money in is, so it lands on the who-has-paid
   * sheet under their name instead of under whoever is saving it.
   */
  contributorId?: number | null;
  /**
   * A plain note against the entry, the same as expenses already have. Only carried through
   * for an ordinary deposit or disbursement — a move, a savings transfer and a contribution
   * do not accept one yet.
   */
  notes?: string;
  /**
   * Records this line in a budget the person manages other than the one being worked in —
   * a side hustle run as its own project, say, buying stock from and selling it back into the
   * same M-Pesa account. Chosen once per line: which budget, which of its accounts, and either
   * a category in it (money out) or, optionally, one of its income sources (money in).
   */
  otherBudget?: {
    groupId: number;
    groupName: string;
    accountId: number;
    accountName: string;
    category?: string;
    incomeSourceId?: number | null;
  } | null;
  /**
   * True while `otherBudget` is only Jamvi"s suggestion, from a payee the person
   * asked it to remember as belonging to that budget: it waits for them to
   * confirm, like a suggested category. False once the person chose (or chose
   * "No") themselves, so a remembered budget is never put back over their answer.
   */
  otherBudgetAuto?: boolean;
};

/**
 * Where a line goes, in one word. A line goes to exactly one place: a category (ordinary
 * spending or income), a debt with a person or company, a move between the person"s own
 * accounts, a savings goal, a group member"s contribution, or a different budget entirely.
 * Everything that has to treat these differently asks this instead of checking each field
 * on its own.
 */
export type Destination = "category" | "debt" | "transfer" | "savings" | "contribution" | "other-budget";

export function destinationOf(choice: Choice | undefined): Destination {
  if (!choice) return "category";
  if (choice.otherBudget) return "other-budget";
  if (choice.transferTo) return "transfer";
  if (choice.savingsGoalId) return "savings";
  if (choice.contributorId) return "contribution";
  if (choice.debt) return "debt";
  return "category";
}

/**
 * Money that is not this budget"s own income or spending: it moves between the person"s own
 * places, or it is being recorded in a different budget entirely. Needs no category, no debt
 * link and no income source here.
 */
export const isMove = (choice: Choice | undefined): boolean => {
  const destination = destinationOf(choice);
  return destination === "transfer" || destination === "savings" || destination === "other-budget";
};

/**
 * Whether a line offers its optional note: once it says what the money was -
 * a category, a person or business it was a debt with, or where money in came
 * from - and it is ordinary money in or out, which is what carries a note
 * (buildPostings). A move between the person"s own places does not.
 * "Brief descriptions ... when you have selected a category or someone/business
 * during import. It should be optional" (6 Oct 2026). Saving a note was added in
 * #417, but no screen ever had the box to type one.
 */
export function canAddNote(choice: Choice | undefined): boolean {
  if (!choice?.include || isMove(choice) || destinationOf(choice) === "contribution") return false;
  return Boolean(choice.category.trim() || choice.debt || choice.incomeSourceId);
}

/**
 * A category for money out already saved as "Not sure yet", worked out the way
 * the import suggests one (suggestionFor): the person"s kept rules, how they
 * filed the payee before, similar names and words, then well-known payees.
 * Entries still under Not sure are left out of the history, so an unsorted
 * payee never suggests Not sure for itself. Only one of `categoryNames` -
 * categories that carry spending - is ever suggested; otherwise "".
 * "Can it go back to entries saved as not sure and preselect?" (7 Oct 2026).
 */
const knownHistory = new WeakMap<readonly PastPosting[], PastPosting[]>();
function withoutNotSure(history: readonly PastPosting[]): PastPosting[] {
  const cached = knownHistory.get(history);
  if (cached) return cached;
  const notSure = NOT_SURE_CATEGORY.toLowerCase();
  const known = history.filter((posting) => (posting.expenseCategory ?? "").trim().toLowerCase() !== notSure);
  knownHistory.set(history, known);
  return known;
}

export function suggestForSaved(
  entry: { description: string; direction: "in" | "out" },
  history: readonly PastPosting[],
  categoryNames: readonly string[],
  rules: PayeeRules = {},
): string {
  if (entry.direction !== "out" || !entry.description.trim()) return "";
  const notSure = NOT_SURE_CATEGORY.toLowerCase();
  // The same filtered history for every entry: the matchers cache what they
  // read from a history by the array itself, and a fresh copy per entry missed
  // that cache every time - 754 entries against 2,000 took 45 s on a PC and
  // froze the phone (7 Oct 2026).
  const known = withoutNotSure(history);
  const line: PreviewLine = {
    index: 0, status: "ready", reason: null, receipt: null, direction: "out", type: null, amount: null,
    description: entry.description, named: true, date: null, fee: null, mpesaBalance: null, alreadyRecorded: null,
  };
  const suggested = suggestionFor(line, known, categoryNames, "", rules);
  return suggested && suggested.toLowerCase() !== notSure && categoryNames.includes(suggested) ? suggested : "";
}

type PastPosting = { type: string; description: string; expenseCategory?: string | null; incomeSourceId?: number | null; chargeForTransactionId?: number | null };

const clean = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-KE");

/**
 * The category this same payee was filed under before, so the second payment
 * to Kenya Power is one tap. Learned from what is already in the books: the
 * category used most often for that description, or "" when there is none.
 */
export function suggestCategory(description: string, history: readonly PastPosting[]): string {
  const wanted = clean(description);
  if (!wanted) return "";
  return mostUsedFor(history).categories.get(wanted) ?? "";
}

/**
 * Each description"s most-used category and income source, read from the
 * history once rather than once per line of a statement (see prepare in
 * payeeLearning). The first to reach the top count wins, as before.
 */
const mostUsed = new WeakMap<readonly PastPosting[], { categories: Map<string, string>; sources: Map<string, number> }>();
function mostUsedFor(history: readonly PastPosting[]) {
  const cached = mostUsed.get(history);
  if (cached) return cached;
  const categoryCounts = new Map<string, Map<string, number>>();
  const sourceCounts = new Map<string, Map<number, number>>();
  for (const posting of history) {
    const key = clean(posting.description);
    if (posting.type === "disbursement" && posting.expenseCategory && !isFeePosting(posting)) {
      const counts = categoryCounts.get(key) ?? new Map<string, number>();
      counts.set(posting.expenseCategory, (counts.get(posting.expenseCategory) ?? 0) + 1);
      categoryCounts.set(key, counts);
    }
    if (posting.type === "deposit" && posting.incomeSourceId) {
      const counts = sourceCounts.get(key) ?? new Map<number, number>();
      counts.set(posting.incomeSourceId, (counts.get(posting.incomeSourceId) ?? 0) + 1);
      sourceCounts.set(key, counts);
    }
  }
  const top = <K,>(counts: Map<K, number>): K | undefined => {
    let best: K | undefined;
    let bestCount = 0;
    for (const [value, count] of counts) {
      if (count > bestCount) {
        best = value;
        bestCount = count;
      }
    }
    return best;
  };
  const categories = new Map<string, string>();
  for (const [key, counts] of categoryCounts) categories.set(key, top(counts) ?? "");
  const sources = new Map<string, number>();
  for (const [key, counts] of sourceCounts) {
    const best = top(counts);
    if (best != null) sources.set(key, best);
  }
  const built = { categories, sources };
  mostUsed.set(history, built);
  return built;
}

/**
 * The income source money from this sender was filed under before, so a client
 * who pays every month is tagged once. The one used most often for that
 * description among earlier deposits, or null when there is none.
 */
export function suggestIncomeSource(description: string, history: readonly PastPosting[]): number | null {
  const wanted = clean(description);
  if (!wanted) return null;
  return mostUsedFor(history).sources.get(wanted) ?? null;
}

/** Can this line be recorded at all, before anybody has chosen anything? */
export const isRecordable = (line: PreviewLine): boolean =>
  line.status === "ready" && !line.alreadyRecorded && line.amount !== null && line.direction !== null;

// Kinds of payment whose category is obvious from the kind alone, and the words
// a budget"s own category for it is likely to use. Only a category that already
// exists is ever suggested; nothing is created, and the person can change it.
const KIND_DEFAULTS: Record<string, readonly string[]> = {
  airtime_purchase: ["airtime", "data", "phone", "communication", "bundle"],
  cash_withdrawal: ["cash", "withdraw"],
  fuliza_fee: ["bank charge", "charge", "fee", "fuliza"],
  transaction_charge: ["m-pesa charges", "transaction charges", "bank charge", "charge", "fee"],
};

// A payee that names a group people pay into, and the words a category for it is likely to use.
/** A payment to a bank or a bank"s paybill, rather than to whoever was paid through it. */
const BANK_PAYEE = /\b(?:bank|paybill account|equity|kcb|co-?op(?:erative)?|ncba|stanbic|absa|i\s?&\s?m|dtb|diamond trust|stanchart|standard chartered|sidian|sbm|gulf african|family bank|prime bank|credit bank|bank of africa|consolidated bank|national bank|housing finance|hfc)\b/i;
export const isBankPayee = (description: string): boolean => BANK_PAYEE.test(description);

/**
 * Money in from a person, a bank or a cash deposit at an agent is not given a
 * source from history: it may be a loan, a repayment, a gift or the person"s
 * own money moving, so it waits with none and Sort them out asks ("money
 * received from people and bank should go to not sure", 8 Oct 2026). A kept
 * rule is not involved: income sources are only ever suggested from history.
 */
const NO_GUESS_IN = new Set(["person_receipt", "bank_receipt", "cash_deposit"]);
export const sourceNotGuessed = (line: { type: string | null; description: string | null }): boolean =>
  (line.type !== null && NO_GUESS_IN.has(line.type)) || Boolean(line.description && isBankPayee(line.description));

/**
 * Those same lines start under Not sure, filed by Jamvi, so they save with the
 * rest and Sort them out brings each one back - not left blank for the person
 * to answer before saving ("the money in from people or agent or bank should
 * be under not sure until sorted", 8 Oct 2026). Loans and savings keep their own filing.
 */
const notSureIn = (line: PreviewLine): boolean =>
  line.direction === "in" && !loanOf(line) && !savingsOf(line) && sourceNotGuessed(line);

const GROUP_PAYEE = /\b(chama|sacco|welfare|merry|self[- ]?help|group)\b/i;
const GROUP_CATEGORY_WORDS = ["chama", "sacco", "contribution", "welfare", "merry"];

/** A category from this budget that suits the kind of payment, or "" when none does. */
export function defaultCategoryFor(line: PreviewLine, categoryNames: readonly string[]): string {
  if (line.direction === "out" && line.description && GROUP_PAYEE.test(line.description)) {
    const named = categoryNames.find((name) => GROUP_CATEGORY_WORDS.some((word) => name.toLowerCase().includes(word)));
    if (named) return named;
  }
  const words = line.type ? KIND_DEFAULTS[line.type] : undefined;
  if (!words) return "";
  for (const word of words) {
    const match = categoryNames.find((name) => name.toLocaleLowerCase("en-KE").includes(word));
    if (match) return match;
  }
  return "";
}

/**
 * Recordable lines start ticked. Money out starts with a suggestion: the
 * category that payee was filed under before, or failing that one that suits
 * the kind of payment. It is only a starting point; every category can be
 * changed by hand.
 */
export function initialChoices(
  lines: readonly PreviewLine[],
  history: readonly PastPosting[],
  categoryNames: readonly string[] = [],
  chargeCategory = "",
  rules: PayeeRules = {},
  /** False for a member of a shared group: only an owner or admin can record payments out, so those start unticked. */
  canRecordOut = true,
): Record<number, Choice> {
  const choices: Record<number, Choice> = {};
  for (const line of lines) {
    const suggested = notSureIfNothing(line, suggestionFor(line, history, categoryNames, chargeCategory, rules));
    choices[line.index] = {
      // Savings either way need an owner or admin, as payments out do.
      // A code already saved in another budget starts unticked, so it is not counted twice.
      include: isRecordable(line) && !line.elsewhere && (canRecordOut || (line.direction !== "out" && !savingsOf(line))),
      category: suggested,
      auto: suggested !== "",
      ...(filedByJamvi(line, suggested) ? { confirmed: true } : {}),
    };
    if (line.direction === "in") {
      // A loan drawn (Fuliza, M-Shwari, KCB M-PESA, Hustler Fund) is borrowed, never income, so it is offered no source.
      // A source the person kept for this payer comes first (payeeLearning ruleSource):
      // a business"s customer is that business"s sales, even from a person"s number.
      const kept = line.description && loanOf(line)?.kind !== "borrowed" && !savingsOf(line) ? ruleSource(line.description, rules) : null;
      const source = kept ?? (line.description && loanOf(line)?.kind !== "borrowed" && !savingsOf(line) && !sourceNotGuessed(line) ? suggestIncomeSource(line.description, history) : null);
      choices[line.index] = { ...choices[line.index], incomeSourceId: source, sourceAuto: source !== null, ...(notSureIn(line) && kept === null ? { confirmed: true } : {}) };
    }
  }
  return choices;
}

/**
 * Lines nobody has to look at: airtime, bundles and Home Fibre (lib/mpesaProducts),
 * M-Pesa"s and Fuliza"s own charges, and loans from Fuliza, M-Shwari, KCB M-PESA
 * and Hustler Fund. Jamvi files them and they count as
 * confirmed, so they save with the rest; the person can still change or untick
 * any of them. Asked for 5 Oct 2026: "these things have no bone of contention".
 */
export function filedByJamvi(line: PreviewLine, category: string): boolean {
  // A loan goes to its lender in Who owes who, and savings to their account in Savings, when saved
  // (lib/mpesaDebts withLenderDebts, lib/mpesaProducts withSavingsAccounts).
  if (loanOf(line) || savingsOf(line)) return true;
  if (line.direction !== "out" || !category || category === NOT_SURE_CATEGORY) return false;
  return productOf(line) !== null || line.type === "transaction_charge" || line.type === "fuliza_fee";
}

/** The category money out is filed under when nobody can yet say what it was for (lib/entriesToSort). */
export const NOT_SURE_CATEGORY = "Not sure yet";

/**
 * Money out Jamvi has nothing to suggest for starts on "Not sure yet" - asked
 * for 2 Oct 2026 - as a suggestion like any other: it waits for the person to
 * confirm it (one at a time or with the bulk buttons), and Home brings it back
 * to sort once saved. Loans are left alone: paying one back needs no category.
 */
function notSureIfNothing(line: PreviewLine, suggested: string): string {
  if (suggested || line.direction !== "out" || line.type?.startsWith("fuliza_") || loanOf(line) || savingsOf(line)) return suggested;
  return NOT_SURE_CATEGORY;
}

function suggestionFor(
  line: PreviewLine,
  history: readonly PastPosting[],
  categoryNames: readonly string[],
  chargeCategory: string,
  rules: PayeeRules = {},
): string {
  if (line.direction !== "out") return "";
  // Built-in categories win: a Fuliza fee goes to Fuliza charges when the
  // budget has it, and a lone M-Pesa charge to the charges category - before
  // any guess from a payee, which a charge does not have. A budget without
  // Fuliza charges yet keeps the old order below.
  if (line.type === "fuliza_fee") {
    const builtIn = categoryNames.find((name) => name.trim().toLowerCase() === "fuliza charges");
    if (builtIn) return builtIn;
  }
  if (line.type === "transaction_charge") return chargeCategory || defaultCategoryFor(line, categoryNames);
  // Paying back a loan only clears the debt: what it bought was recorded when it was spent.
  // Money into savings is not spent at all.
  if (loanOf(line) || savingsOf(line)) return "";
  const description = line.description ?? "";
  // A rule the person kept, then this exact payee"s history, then payees with a similar name,
  // then a word that has nearly always meant one category in their own books, then a
  // well-known payee (lib/knownPayees).
  const kept = description ? ruleCategory(description, rules, line.payeeNumber) : "";
  const earlier = description ? suggestCategory(description, history) : "";
  // A Safaricom product goes where the person keeps it, and otherwise to its ledger under M-Pesa -
  // never to a guess from a similar name, which could be anything.
  const product = productOf(line);
  if (product) {
    return (kept && (categoryNames.length === 0 || categoryNames.includes(kept)) ? kept : "") || (earlier !== NOT_SURE_CATEGORY ? earlier : "") || productCategory(product, categoryNames);
  }
  // A bank"s paybill says nothing about what the money was for - a loan, school
  // fees, a supermarket, a transfer - so only the person"s own kept rule names
  // it; otherwise it waits as Not sure. "Equity Paybill Account -> Supermarket"
  // was a guess from history (7 Oct 2026).
  if (description && isBankPayee(description)) {
    return kept && (categoryNames.length === 0 || categoryNames.includes(kept)) ? kept : "";
  }
  // A person is filed by a kept rule or by how that same person was filed before -
  // "if the app has learnt from history about people categorization then its ok"
  // (8 Oct 2026) - but never by a similar name or a shared word: names share
  // common words ("Mary", "Kamau"), and two Marys filed under Food say nothing
  // about a third. With neither, the person waits as Not sure.
  const toPerson = line.type === "person_payment" || (line.type === null && looksLikePerson(description));
  const similar = description && line.named !== false && !toPerson ? fuzzyCategory(description, history, categoryNames) : "";
  const byWord = description && line.named !== false && !toPerson ? wordCategory(description, history, categoryNames) : "";
  return (
    (kept && (categoryNames.length === 0 || categoryNames.includes(kept)) ? kept : "") ||
    earlier ||
    similar ||
    byWord ||
    // Then a payee whose category is obvious from its name (Kenya Power, a supermarket):
    // the person"s own books always come first.
    (description ? knownPayeeCategory(description, categoryNames) : "") ||
    (line.type === "fuliza_fee" ? chargeCategory : "") ||
    defaultCategoryFor(line, categoryNames)
  );
}

/**
 * Suggestions again, after a payee was renamed: the new name may match earlier
 * entries the old one did not. Only lines still on a suggestion or on nothing
 * are touched; a category the person chose is never replaced.
 */
export function refreshSuggestions(
  lines: readonly PreviewLine[],
  choices: Record<number, Choice>,
  history: readonly PastPosting[],
  categoryNames: readonly string[],
  chargeCategory = "",
  rules: PayeeRules = {},
): Record<number, Choice> {
  const next: Record<number, Choice> = { ...choices };
  for (const line of lines) {
    const current = choices[line.index];
    if (!current) continue;
    // Never confirmed or unconfirmed by the person: a line Jamvi files itself counts as
    // confirmed - so a statement worked on before 5 Oct 2026, restored from its draft,
    // gets its airtime, bundles, charges and loans filed too (see filedByJamvi).
    const untouched = current.confirmed === undefined && current.include && destinationOf(current) === "category";
    if (line.direction === "in") {
      const kept = line.description && loanOf(line)?.kind !== "borrowed" && !savingsOf(line) ? ruleSource(line.description, rules) : null;
      if (kept !== null && (current.incomeSourceId == null || current.sourceAuto)) {
        next[line.index] = { ...current, incomeSourceId: kept, sourceAuto: true };
        continue;
      }
      if (untouched && (loanOf(line)?.kind === "borrowed" || savingsOf(line) || notSureIn(line))) {
        next[line.index] = { ...current, incomeSourceId: null, sourceAuto: false, confirmed: true };
        continue;
      }
      // A source the person chose is never replaced; a suggestion is offered again.
      if (current.incomeSourceId == null || current.sourceAuto) {
        const source = line.description && loanOf(line)?.kind !== "borrowed" && !savingsOf(line) && !sourceNotGuessed(line) ? suggestIncomeSource(line.description, history) : null;
        next[line.index] = { ...current, incomeSourceId: source, sourceAuto: source !== null };
      }
      continue;
    }
    if (current.category && !current.auto) continue;
    const suggested = notSureIfNothing(line, suggestionFor(line, history, categoryNames, chargeCategory, rules));
    next[line.index] = {
      ...current,
      category: suggested,
      auto: suggested !== "",
      ...(untouched && filedByJamvi(line, suggested) ? { confirmed: true } : {}),
    };
  }
  return next;
}

/**
 * The person picks where money in came from. It is theirs from then on, and the
 * same sender"s other lines that have no source get it too, so a client"s twelve
 * payments take one choice. Picking none clears it.
 */
export function chooseIncomeSource(
  lines: readonly PreviewLine[],
  choices: Record<number, Choice>,
  index: number,
  sourceId: number | null,
): Record<number, Choice> {
  const chosen = lines.find((line) => line.index === index);
  // "Not sure" is the person"s answer as much as a source is: it confirms the
  // line, so it saves and is brought back to sort out, with no Confirm tick.
  const next: Record<number, Choice> = {
    ...choices,
    [index]: { ...choices[index], incomeSourceId: sourceId, sourceAuto: false, ...(sourceId === null ? { confirmed: true } : {}) },
  };
  if (!chosen?.description || sourceId === null) return next;
  const sender = clean(chosen.description);
  for (const line of lines) {
    if (line.index === index || line.direction !== "in" || !line.description) continue;
    if (clean(line.description) !== sender) continue;
    if (choices[line.index]?.incomeSourceId) continue;
    next[line.index] = { ...choices[line.index], incomeSourceId: sourceId, sourceAuto: true };
  }
  return next;
}

/**
 * The person picks a category by hand. It is theirs from then on, and the same
 * payee"s other lines that still have none get it too, so twelve airtime top-ups
 * take one choice, not twelve.
 */
export function chooseCategory(
  lines: readonly PreviewLine[],
  choices: Record<number, Choice>,
  index: number,
  category: string,
): Record<number, Choice> {
  const chosen = lines.find((line) => line.index === index);
  // Remembered unless it was unticked for this line before.
  const next: Record<number, Choice> = { ...choices, [index]: { ...choices[index], category, auto: false, remember: choices[index]?.remember ?? true } };
  if (!chosen?.description || !category) return next;
  const payee = clean(chosen.description);
  for (const line of lines) {
    if (line.index === index || line.direction !== "out" || !line.description) continue;
    if (clean(line.description) !== payee) continue;
    // Jamvi"s own "Not sure yet" is no answer: the payee"s choice replaces it.
    const other = choices[line.index];
    if (other?.category && !(other.auto && other.category === NOT_SURE_CATEGORY)) continue;
    next[line.index] = { ...choices[line.index], category, auto: true };
  }
  return next;
}

/** A line in words that find it in a long list: who, how much, and when. */
export function lineLabel(line: PreviewLine): string {
  const money = line.amount === null ? "" : `KES ${line.amount.toLocaleString("en-KE")}`;
  const detail = [money, line.date].filter(Boolean).join(", ");
  return `${line.description ?? "A payment"}${detail ? ` (${detail})` : ""}`;
}

/**
 * The start of the message a line came from, taken from what was pasted on
 * this device. Shown only for a line the parser could not name, so it can be
 * recognised; it never leaves the phone.
 */
export function snippetFor(pasted: string, receipt: string | null, length = 90): string | null {
  if (!receipt) return null;
  const at = pasted.indexOf(receipt);
  if (at < 0) return null;
  return pasted.slice(at, at + length * 2).replace(/\s+/g, " ").trim().slice(0, length);
}

/**
 * A loan - Fuliza, M-Shwari, KCB M-PESA, Hustler Fund - paid back to its debt
 * with no category of its own. Filed under a category it would count twice:
 * once as what the loan bought, once as paying it back.
 */
export const paysOffLoan = (line: PreviewLine, choice: Choice): boolean =>
  loanOf(line)?.kind === "pay-back" && choice.debt?.kind === "pay-back" && !choice.category.trim();

/** Fuliza"s case of paysOffLoan. */
export const paysOffFuliza = (line: PreviewLine, choice: Choice): boolean =>
  line.type === "fuliza_repaid" && paysOffLoan(line, choice);

/** Why a ticked line cannot be saved yet, or null when it can. */
export function problemWith(line: PreviewLine, choice: Choice | undefined): string | null {
  if (!choice?.include || !isRecordable(line)) return null;
  if (choice.otherBudget) {
    if (!choice.otherBudget.accountId) return `Choose an account in ${choice.otherBudget.groupName}.`;
    if (line.direction === "out" && !choice.otherBudget.category?.trim()) return `Choose what it was for in ${choice.otherBudget.groupName}.`;
    return null;
  }
  // Money moved between the person"s own places is not spending, so it needs no category.
  if (isMove(choice)) return null;
  // Money lent is not spending, so it needs no category; paying a debt back does.
  // Paying a loan back needs no category: saving links it to its lender in Who owes who.
  const loanRepayment = loanOf(line)?.kind === "pay-back" && (paysOffLoan(line, choice) || !choice.debt);
  // Into M-Shwari, KCB M-PESA, Ziidi or Mali: saving links it to that account in Savings.
  const intoSavings = Boolean(savingsOf(line)?.into) && !choice.debt;
  if (line.direction === "out" && choice.debt?.kind !== "lend" && !loanRepayment && !intoSavings && !choice.category.trim()) return "Choose what it was for.";
  return null;
}

/**
 * Where a line stands in the person"s review of the list:
 * `needs` cannot be saved until something is chosen; `changed` is something they
 * set or changed themselves (a category, a debt, a source, or unticking it);
 * `suggested` is still exactly what Jamvi suggested and has not been touched.
 * Lines that cannot be recorded at all are not part of the review.
 */
export type ReviewStatus = "needs" | "changed" | "suggested";

export function reviewStatus(line: PreviewLine, choice: Choice | undefined): ReviewStatus | null {
  if (!isRecordable(line) || !choice) return null;
  if (problemWith(line, choice)) return "needs";
  const setByHand = Boolean(choice.category.trim()) && choice.auto === false;
  const sourceByHand = choice.incomeSourceId != null && choice.sourceAuto === false;
  if (!choice.include || choice.confirmed) return "changed";
  // Another budget Jamvi remembered for this payee is a suggestion until confirmed.
  if (destinationOf(choice) === "other-budget") return choice.otherBudgetAuto ? "suggested" : "changed";
  if (setByHand || sourceByHand || destinationOf(choice) !== "category") return "changed";
  return "suggested";
}

/**
 * Whether a line goes out with the next save: ticked, with nothing missing,
 * and confirmed or changed by the person. Jamvi"s untouched suggestions wait.
 */
export function isConfirmedToSave(line: PreviewLine, choice: Choice | undefined): boolean {
  return Boolean(choice?.include) && isRecordable(line) && reviewStatus(line, choice) === "changed";
}

/**
 * Choices made on an earlier reading of the same statement, carried to a new
 * reading by receipt - so reading the statement again (after an update that
 * reads it better) keeps everything already worked through.
 */
export function carryChoices(
  before: readonly PreviewLine[],
  beforeChoices: Record<number, Choice>,
  after: readonly PreviewLine[],
  afterChoices: Record<number, Choice>,
): Record<number, Choice> {
  const byReceipt = new Map<string, Choice>();
  for (const line of before) {
    const choice = beforeChoices[line.index];
    if (line.receipt && choice) byReceipt.set(`${line.receipt}|${line.direction}|${line.amount}`, choice);
  }
  const next = { ...afterChoices };
  for (const line of after) {
    const kept = line.receipt ? byReceipt.get(`${line.receipt}|${line.direction}|${line.amount}`) : undefined;
    if (kept) next[line.index] = kept;
  }
  return next;
}

export type ReviewView = "all" | ReviewStatus;

export function reviewCounts(lines: readonly PreviewLine[], choices: Record<number, Choice>): Record<ReviewView, number> {
  const counts: Record<ReviewView, number> = { all: 0, needs: 0, changed: 0, suggested: 0 };
  for (const line of lines) {
    const status = reviewStatus(line, choices[line.index]);
    if (!status) continue;
    counts.all += 1;
    counts[status] += 1;
  }
  return counts;
}

export type Summary = {
  count: number;
  moneyIn: number;
  moneyOut: number;
  fees: number;
  missingCategory: number;
  moves: number;
  /** Recorded in a different budget entirely: not this budget"s income or spending either. */
  toOtherBudgets: number;
};

export function summarise(lines: readonly PreviewLine[], choices: Record<number, Choice>): Summary {
  const summary: Summary = { count: 0, moneyIn: 0, moneyOut: 0, fees: 0, missingCategory: 0, moves: 0, toOtherBudgets: 0 };
  for (const line of lines) {
    const choice = choices[line.index];
    if (!choice?.include || !isRecordable(line) || line.amount === null) continue;
    summary.count += 1;
    if (isMove(choice)) {
      // A move between the person"s own places, or a line going to a different budget
      // entirely, is neither money in nor money out here; only its charge is a cost.
      if (destinationOf(choice) === "other-budget") summary.toOtherBudgets += 1;
      else summary.moves += 1;
      if (line.direction === "out") summary.fees += line.fee ?? 0;
      continue;
    }
    if (line.direction === "in") summary.moneyIn += line.amount;
    else {
      summary.moneyOut += line.amount;
      summary.fees += line.fee ?? 0;
      if (!choice.category.trim()) summary.missingCategory += 1;
    }
  }
  const round = (value: number) => Math.round(value * 100) / 100;
  return { ...summary, moneyIn: round(summary.moneyIn), moneyOut: round(summary.moneyOut), fees: round(summary.fees) };
}

export type PostingContext = {
  accountId: number;
  userId: string | undefined;
  isShared: boolean;
  /** YYYY-MM-DD, used when the message carried no date. */
  today: string;
  /** Where the M-Pesa transaction cost is filed. */
  chargeCategory: string;
  /** The income sources, so a deposit can name the member a source belongs to. */
  incomeSources?: ReadonlyArray<{ id: number; userId?: string | null }>;
  /**
   * Who is currently a member of this budget. A source whose owner has left,
   * or was never quite recorded as one - some other data problem, not a
   * choice made here - would otherwise fail the whole entry at save time
   * over an attribution nobody was trying to get right in the first place.
   */
  memberIds?: ReadonlyArray<string>;
};

/**
 * What to send the ordinary deposit and disbursement routes for one line.
 *
 * The receipt rides along, which is what makes a second paste of the same
 * message refuse itself. The transaction cost is its own posting, linked to the
 * payment it belongs to, the same as a bank charge entered by hand.
 */
export function buildPostings(line: PreviewLine, choice: Choice, ctx: PostingContext) {
  if (line.amount === null || !line.direction) return null;
  const date = line.date ?? ctx.today;
  const description = line.description ?? "M-Pesa";
  const receipt = line.receipt ?? undefined;

  // The charge on money moved out of M-Pesa is the same wherever it went.
  const moveFee =
    line.direction === "out" && line.fee && line.fee > 0 && ctx.chargeCategory.trim()
      ? {
          amount: line.fee,
          description: `Bank charge — ${description}`,
          date,
          madeById: ctx.isShared ? null : ctx.userId,
          expenseCategory: ctx.chargeCategory.trim(),
          destinationKind: "category" as const,
          accountId: ctx.accountId,
        }
      : null;

  // Recorded in a different budget entirely, by its own account and category or income source.
  // The M-Pesa charge, if any, is still a real cost on this budget"s own account, so it stays
  // here — but it cannot be linked to the entry it came with, which lives in another budget"s
  // own history now.
  if (choice.otherBudget) {
    const target = choice.otherBudget;
    return {
      kind: "other-budget" as const,
      groupId: target.groupId,
      direction: line.direction,
      main:
        line.direction === "in"
          ? {
              amount: line.amount,
              description,
              date,
              accountId: target.accountId,
              ...(target.incomeSourceId ? { incomeSourceId: target.incomeSourceId } : {}),
              ...(receipt ? { mpesaReceipt: receipt } : {}),
            }
          : {
              amount: line.amount,
              description,
              date,
              accountId: target.accountId,
              expenseCategory: (target.category ?? "").trim(),
              destinationKind: "category" as const,
              ...(receipt ? { mpesaReceipt: receipt } : {}),
            },
      fee: moveFee,
    };
  }

  // Into or out of a savings goal: one savings transfer, whole shillings, with the receipt on it.
  if (choice.savingsGoalId) {
    return {
      kind: "savings" as const,
      direction: line.direction,
      main: {
        goalId: choice.savingsGoalId,
        amount: line.amount,
        narration: description,
        date,
        accountId: ctx.accountId,
        madeById: ctx.isShared ? null : ctx.userId ?? null,
        ...(receipt ? { mpesaReceipt: receipt } : {}),
      },
      fee: moveFee,
    };
  }

  // Between the person"s own accounts: a transfer, with the receipt on the M-Pesa side, and any charge as before.
  if (choice.transferTo) {
    const out = line.direction === "out";
    return {
      kind: "transfer" as const,
      main: {
        sourceAccountId: out ? ctx.accountId : choice.transferTo,
        destinationAccountId: out ? choice.transferTo : ctx.accountId,
        amount: line.amount,
        narration: description,
        date,
        ...(receipt ? { mpesaReceipt: receipt, mpesaAccountId: ctx.accountId } : {}),
      },
      fee: moveFee,
    };
  }

  // A group member"s contribution: recorded under their name on the who-has-paid sheet.
  if (line.direction === "in" && choice.contributorId) {
    return {
      kind: "deposit" as const,
      main: {
        amount: line.amount,
        description,
        date,
        contributorSplits: [{ contributorId: choice.contributorId, amount: line.amount }],
        accountId: ctx.accountId,
        ...(receipt ? { mpesaReceipt: receipt } : {}),
        ...(choice.notes?.trim() ? { notes: choice.notes.trim() } : {}),
      },
      fee: null,
    };
  }

  if (line.direction === "in") {
    // A source is only for income: a repayment or a loan is not, so it takes none.
    const source = choice.incomeSourceId && !choice.debt && loanOf(line)?.kind !== "borrowed" ? ctx.incomeSources?.find((entry) => entry.id === choice.incomeSourceId) : undefined;
    // A source belongs to one member, and the server only accepts the deposit
    // when it names exactly that member as who made it - not merely any
    // current member. A source whose owner is not currently a member
    // (removed, or a data problem) can"t be paired with anyone truthfully,
    // so the source is dropped rather than guessing a depositor for it -
    // recording the deposit plainly beats failing the whole entry over an
    // attribution nobody was trying to get right just now.
    const sourceOwnerIsMember = source?.userId != null && (!ctx.memberIds || ctx.memberIds.includes(source.userId));
    const usableSource = sourceOwnerIsMember ? source : undefined;
    return {
      kind: "deposit" as const,
      main: {
        amount: line.amount,
        description,
        date,
        madeById: usableSource?.userId ?? ctx.userId,
        ...(usableSource ? { incomeSourceId: usableSource.id } : {}),
        accountId: ctx.accountId,
        // They paid back what they owed you, or you borrowed from them: neither
        // is income, and the server keeps both out of the income figures.
        ...(choice.debt?.kind === "repaid" ? { settlesContributorId: choice.debt.partyId } : {}),
        ...(choice.debt?.kind === "borrowed" || (!choice.debt && loanOf(line)?.kind === "borrowed") ? { isBorrowing: true } : {}),
        ...(receipt ? { mpesaReceipt: receipt } : {}),
        ...(choice.notes?.trim() ? { notes: choice.notes.trim() } : {}),
      },
      fee: null,
    };
  }

  // Paid by whoever is importing: it is their M-Pesa, and "the group" on
  // every line of a shared group"s import hid who actually paid.
  const madeById = ctx.userId ?? null;
  // Lending is not a cost: no category, and linked to who it went to.
  const lending = choice.debt?.kind === "lend";
  // Nor is paying a loan back: what the loan bought was recorded as spending
  // when it was bought, so the repayment only clears the debt.
  const clearing = paysOffLoan(line, choice);
  return {
    kind: "disbursement" as const,
    main: {
      amount: line.amount,
      description,
      date,
      madeById,
      ...(lending
        ? { isLending: true, settlesContributorId: choice.debt!.partyId }
        : clearing
          ? { settlesContributorId: choice.debt!.partyId }
          : { expenseCategory: choice.category.trim(), destinationKind: "category" as const }),
      accountId: ctx.accountId,
      ...(receipt ? { mpesaReceipt: receipt } : {}),
      ...(choice.notes?.trim() ? { notes: choice.notes.trim() } : {}),
    },
    fee:
      line.fee && line.fee > 0 && ctx.chargeCategory.trim()
        ? {
            amount: line.fee,
            description: `Bank charge — ${description}`,
            date,
            madeById,
            expenseCategory: ctx.chargeCategory.trim(),
            destinationKind: "category" as const,
            accountId: ctx.accountId,
          }
        : null,
  };
}

/**
 * The same split the server makes, so line N of the review list is message N
 * of what was pasted. Kept in step with the server by a test.
 */
export function splitMessages(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];
  return normalized
    .split(/(?=\b(?=[A-Z0-9]*\d)[A-Z0-9]{8,15}\s+[Cc]onfirmed\b)/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 200);
}

/** The pasted message a review line came from, or null if it cannot be found. */
export const messageFor = (pasted: string, index: number): string | null => splitMessages(pasted)[index] ?? null;

/**
 * Lines worth sending so Jamvi can learn the format: a message that could not
 * be read at all, one of a kind Jamvi does not know, or one that read but named
 * nobody. Not the kinds Jamvi understands and leaves for the person, and not a
 * repeat.
 */
export function canReport(line: PreviewLine): boolean {
  if (line.alreadyRecorded) return false;
  if (line.status === "skipped") return line.type === null || line.type === "other";
  return line.named === false;
}

// Includes the masked form M-Pesa prints (0722***443), which is still a number.
const PHONE_PATTERNS = [
  /\+?254[\s-]?(?:7\d{2}|1\d{2})[\s-]?\d{3}[\s-]?\d{3}/g,
  /\b0(?:7\d{2}|1\d{2})[\s-]?\d{3}[\s-]?\d{3}\b/g,
  /\+?254(?:7\d{2}|1\d{2})[*+xX•.]{2,5}\d{3}\b/g,
  /\b0(?:7\d{2}|1\d{2})[*+xX•.]{2,5}\d{3}\b/g,
];

/** Hides phone numbers before somebody sees the text they are about to send. */
export function redactForReport(message: string): string {
  return PHONE_PATTERNS.reduce((text, pattern) => text.replace(pattern, "<PHONE>"), message);
}

/**
 * A category with the heading it sits under, so "Electricity" under Utilities
 * reads "Utilities › Electricity". A heading is not itself something money can
 * be filed under, so without this a chosen subcategory shows no sign of which
 * group it belongs to.
 */
export function categoryPath(
  name: string,
  rows: ReadonlyArray<{ id: number; name: string; parentId?: number | null }>,
): string {
  const row = rows.find((candidate) => candidate.name === name);
  const parent = row?.parentId ? rows.find((candidate) => candidate.id === row.parentId) : undefined;
  return parent ? `${parent.name} › ${name}` : name;
}

/** Entries this budget already has whose category the person can change. */
export const recategorisable = (lines: readonly PreviewLine[]): PreviewLine[] =>
  lines.filter((line) => line.alreadyRecorded?.editable === true && line.receipt !== null && line.direction === "out");

/** What to send to change categories: only entries given a category that differs from the one they have. */
export function categoryChanges(
  lines: readonly PreviewLine[],
  chosen: Record<number, string>,
): Array<{ receipt: string; category: string }> {
  const changes: Array<{ receipt: string; category: string }> = [];
  for (const line of recategorisable(lines)) {
    const category = (chosen[line.index] ?? "").trim();
    if (!category || category === line.alreadyRecorded?.category) continue;
    changes.push({ receipt: line.receipt as string, category });
  }
  return changes;
}

// Choosing one place for a line un-chooses the others, so a line is only ever in one.
const noOtherPlace = { debt: null, incomeSourceId: null, sourceAuto: false, transferTo: null, savingsGoalId: null, contributorId: null, otherBudget: null, otherBudgetAuto: false } as const;

/** Sets, or with null clears, the other account of a move between the person"s own accounts. */
export function chooseTransfer(choices: Record<number, Choice>, index: number, accountId: number | null): Record<number, Choice> {
  const current = choices[index];
  if (!current) return choices;
  return { ...choices, [index]: accountId ? { ...current, ...noOtherPlace, transferTo: accountId } : { ...current, transferTo: null } };
}

/** Sets, or with null clears, the savings goal a line goes into or comes out of. */
export function chooseSavings(choices: Record<number, Choice>, index: number, goalId: number | null): Record<number, Choice> {
  const current = choices[index];
  if (!current) return choices;
  return { ...choices, [index]: goalId ? { ...current, ...noOtherPlace, savingsGoalId: goalId } : { ...current, savingsGoalId: null } };
}

/** Sets, or with null clears, whose contribution a line is (in a shared group). */
export function chooseContribution(choices: Record<number, Choice>, index: number, contributorId: number | null): Record<number, Choice> {
  const current = choices[index];
  if (!current) return choices;
  return { ...choices, [index]: contributorId ? { ...current, ...noOtherPlace, contributorId } : { ...current, contributorId: null } };
}

/** Sets, or with null clears, which other budget a line is recorded in — and which of its
 *  accounts, plus a category (money out) or income source (money in, optional) within it. */
export function chooseOtherBudget(choices: Record<number, Choice>, index: number, otherBudget: Choice["otherBudget"] | null): Record<number, Choice> {
  const current = choices[index];
  if (!current) return choices;
  return {
    ...choices,
    [index]: otherBudget
      ? { ...current, ...noOtherPlace, otherBudget, otherBudgetAuto: false, remember: current.remember ?? true }
      : { ...current, otherBudget: null, otherBudgetAuto: false },
  };
}

/**
 * Lines among `lines` that can be sent to another budget together - a chama"s
 * contributions and payouts found by searching its name, say. Ticked, going to
 * a category or already to another budget; not a debt, a member"s
 * contribution, a move between the person"s own accounts, savings, Fuliza or
 * an M-Pesa charge, which all have a place of their own here.
 */
export function sendableLines(lines: readonly PreviewLine[], choices: Record<number, Choice>): PreviewLine[] {
  return lines.filter((line) => {
    const choice = choices[line.index];
    if (!choice?.include || !isRecordable(line) || choice.debt || line.type?.startsWith("fuliza_") || loanOf(line) || savingsOf(line) || line.type === "transaction_charge") return false;
    const destination = destinationOf(choice);
    return destination === "category" || destination === "other-budget";
  });
}

/**
 * Sends each of `lines` to the same other budget and account, chosen by the
 * person (so each counts as confirmed, and is remembered unless unticked). Money
 * out takes `category`, a category in that budget; money in takes the optional
 * `incomeSourceId`, one of its income sources.
 */
export function sendLinesToOtherBudget(
  lines: readonly PreviewLine[],
  choices: Record<number, Choice>,
  target: { groupId: number; groupName: string; accountId: number; accountName: string; category?: string; incomeSourceId?: number | null },
): Record<number, Choice> {
  let next = choices;
  for (const line of lines) {
    const otherBudget = {
      groupId: target.groupId,
      groupName: target.groupName,
      accountId: target.accountId,
      accountName: target.accountName,
      ...(line.direction === "out" ? { category: target.category ?? "" } : { incomeSourceId: target.incomeSourceId ?? null }),
    };
    next = chooseOtherBudget(next, line.index, otherBudget);
  }
  return next;
}

/** Savings transfers take whole shillings only, and only a payment that could be recorded at all. */
export const canUseSavings = (line: PreviewLine): boolean =>
  isRecordable(line) && line.amount !== null && Number.isInteger(line.amount) && !line.type?.startsWith("fuliza_") && !loanOf(line);

/** Words in a payee that say it is a bank: a payment to one is likely a move between the person"s own accounts. */
export const BANK_WORDS = /\b(bank|equity|kcb|co-?op(erative)?|absa|ncba|stanbic|dtb|i&m|family|sidian|gulf|hf|nba|diamond|standard chartered|citi|hfc|ecobank|uba|prime bank|credit bank|victoria|guaranty|gtb|m-?oriental|paramount|spire)\b/i;

/**
 * Lines that look like money passing through M-Pesa between the person"s own accounts:
 * a payment in from a bank, and, the same day, a payment out of the same amount, or a
 * smaller one to a bank (some was sent on and some stayed in M-Pesa, or went on charges).
 * Only a hint: nothing is decided for the person, and a payment out is only hinted when
 * it is a paybill or matches the amount exactly, so everyday spending is left alone.
 */
export function throughMpesaHints(lines: readonly PreviewLine[]): Set<number> {
  const hints = new Set<number>();
  const fromBank = lines.filter((line) => line.type === "bank_receipt" && line.amount !== null && isRecordable(line));
  for (const incoming of fromBank) {
    hints.add(incoming.index);
    for (const line of lines) {
      if (line.direction !== "out" || line.amount === null || line.date !== incoming.date || !isRecordable(line) || hints.has(line.index)) continue;
      const sameAmount = line.amount === incoming.amount;
      const toABank = line.type === "paybill_payment" && line.amount <= (incoming.amount as number) && BANK_WORDS.test(line.description ?? "");
      if (sameAmount || toABank) hints.add(line.index);
    }
  }
  return hints;
}
/**
 * Whether a line matches what was typed in the review"s search: its payee (as
 * shown or as M-Pesa named it), the kind of line, its code, till or amount.
 * "bundle" finds every Safaricom bundle, so they can be confirmed together.
 * `category` is the one chosen for the line, so a search for "Internet" finds
 * everything filed there and a statement can be saved a category at a time.
 */
export function lineMatches(line: PreviewLine, query: string, category?: string): boolean {
  // "KES 1,000" and "ksh 1000" are an amount: the currency word is dropped.
  const words = query.toLowerCase().replace(/\b(kes|ksh|kshs)\.?(?=\s|\d|$)/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = [line.description, line.original, line.type?.replace(/_/g, " "), line.receipt, line.payeeNumber, line.date, category]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return words.every((word) => {
    // "in 50,000" is money received; "out" / "sent" / "paid" is money that left.
    const direction = DIRECTION_WORDS[word];
    if (direction) return line.direction === direction;
    // A number is that exact amount ("2,000" is not 12,000 or 20,000), or the
    // till or paybill number: paying one amount is often one thing.
    const amount = amountIn(word);
    if (amount !== null) {
      return (line.amount !== null && Math.abs(line.amount - amount) < 0.005) || (line.payeeNumber ?? "").includes(word.replace(/,/g, ""));
    }
    return text.includes(word);
  });
}

const DIRECTION_WORDS: Record<string, "in" | "out"> = { in: "in", received: "in", out: "out", sent: "out", paid: "out" };

/** The amount a search word stands for - "1,000", "1000", "1000.50" - or null for a word. */
export function amountIn(word: string): number | null {
  if (!/^\d[\d,]*(\.\d{1,2})?$/.test(word)) return null;
  const value = Number(word.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

/** Lines among `lines` that "Confirm all" would confirm: ticked, a suggestion, and nothing missing. */
export function confirmableLines(lines: readonly PreviewLine[], choices: Record<number, Choice>): PreviewLine[] {
  return lines.filter((line) => choices[line.index]?.include && reviewStatus(line, choices[line.index]) === "suggested");
}

/** Lines among `lines` that one category can be given to: ticked money out, going to a category. */
export function categorisableLines(lines: readonly PreviewLine[], choices: Record<number, Choice>): PreviewLine[] {
  return lines.filter((line) => {
    const choice = choices[line.index];
    return Boolean(choice?.include) && isRecordable(line) && line.direction === "out" && destinationOf(choice) === "category" && !choice.debt;
  });
}

/** Lines among `lines` that one income stream can be given to: ticked money in, not a debt, a move or a member"s contribution. */
export function streamableLines(lines: readonly PreviewLine[], choices: Record<number, Choice>): PreviewLine[] {
  return lines.filter((line) => {
    const choice = choices[line.index];
    return Boolean(choice?.include) && isRecordable(line) && line.direction === "in" && !choice.debt && !isMove(choice) && !choice.contributorId;
  });
}

/** Gives each of `lines` the same income stream, chosen by the person (so each counts as confirmed). */
export function streamLines(lines: readonly PreviewLine[], choices: Record<number, Choice>, incomeSourceId: number): Record<number, Choice> {
  const next = { ...choices };
  for (const line of lines) next[line.index] = { ...next[line.index], incomeSourceId, sourceAuto: false };
  return next;
}

/** Confirms each of `lines` as it is. */
export function confirmLines(lines: readonly PreviewLine[], choices: Record<number, Choice>): Record<number, Choice> {
  const next = { ...choices };
  for (const line of lines) next[line.index] = { ...next[line.index], confirmed: true, remember: next[line.index]?.remember ?? true };
  return next;
}

/** Gives each of `lines` the same category, chosen by the person (so each counts as confirmed). */
export function categoriseLines(lines: readonly PreviewLine[], choices: Record<number, Choice>, category: string): Record<number, Choice> {
  const next = { ...choices };
  for (const line of lines) next[line.index] = { ...next[line.index], category, auto: false, remember: next[line.index]?.remember ?? true };
  return next;
}


const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The months a statement"s entries fall in, oldest first, with how many of
 * each - for working through a long statement a month at a time.
 */
export function monthsOf(lines: readonly { date: string | null }[]): Array<{ key: string; label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const key = line.date?.slice(0, 7);
    if (key && /^\d{4}-\d{2}$/.test(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const years = new Set([...counts.keys()].map((key) => key.slice(0, 4)));
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => {
      const name = MONTH_SHORT[Number(key.slice(5, 7)) - 1] ?? key;
      // The year only when the statement spans more than one.
      return { key, label: years.size > 1 ? `${name} ${key.slice(0, 4)}` : name, count };
    });
}

/** Whether a line falls in `month` ("2026-01"), or `null` for every month. */
export const inMonth = (line: { date: string | null }, month: string | null): boolean => month === null || line.date?.slice(0, 7) === month;

/* --------------------------------------------------------- the same payment twice */

/**
 * What the server is asked about each recordable line, to find entries typed by
 * hand that look like the same payment (POST /possible-duplicates/check). Only
 * amounts, dates and directions are sent; the key is the line"s index.
 */
export function twinQuestions(lines: readonly PreviewLine[], accountId?: number | null): Array<{ key: string; amount: number; date: string; direction: "in" | "out"; accountId?: number | null }> {
  return lines.flatMap((line) =>
    isRecordable(line) && line.date && line.amount && line.amount > 0 && line.direction
      ? [{ key: String(line.index), amount: line.amount, date: line.date, direction: line.direction, ...(accountId ? { accountId } : {}) }]
      : [],
  );
}

/** The lines with what was found: the other budget a code is already in, and a typed entry that looks the same. */
export function withTwins(
  lines: readonly PreviewLine[],
  matches: ReadonlyArray<{ key: string; entries: ReadonlyArray<{ description: string; date: string; amount: number }> }>,
  elsewhere: ReadonlyArray<{ receipt: string; budget: string }>,
): PreviewLine[] {
  const typed = new Map(matches.map((match) => [match.key, match.entries[0]]));
  const other = new Map(elsewhere.map((row) => [row.receipt, row.budget]));
  return lines.map((line) => {
    const twin = typed.get(String(line.index));
    const budget = line.receipt ? other.get(line.receipt) : undefined;
    return {
      ...line,
      elsewhere: budget ?? line.elsewhere ?? null,
      typedTwin: twin ? { description: twin.description, date: twin.date, amount: twin.amount } : line.typedTwin ?? null,
    };
  });
}

/**
 * Lines found to be in another budget after their choices were made (a paste is
 * checked once read): unticked, unless the person has already said otherwise.
 */
export function untickElsewhere(lines: readonly PreviewLine[], choices: Record<number, Choice>): Record<number, Choice> {
  const next = { ...choices };
  for (const line of lines) {
    const choice = next[line.index];
    if (line.elsewhere && choice?.include && choice.confirmed === undefined) next[line.index] = { ...choice, include: false };
  }
  return next;
}

/** The words on a line that may be a payment recorded before. */
export function twinNotes(line: PreviewLine): string[] {
  const notes: string[] = [];
  if (line.elsewhere) notes.push(`Already saved in ${line.elsewhere}. Left unticked so it is not counted twice - tick it only if it belongs in both.`);
  if (line.typedTwin) {
    const amount = `KES ${line.typedTwin.amount.toLocaleString("en-KE")}`;
    notes.push(`Looks like "${line.typedTwin.description}" (${amount}) you typed on ${line.typedTwin.date}. Save this one from M-Pesa and Home will ask which to keep.`);
  }
  return notes;
}

/** What withTwins found, put on lines already on screen (by index), leaving everything else as it is now. */
export function mergeTwins(current: PreviewLine[] | null, checked: readonly PreviewLine[]): PreviewLine[] | null {
  if (!current) return current;
  const found = new Map(checked.map((line) => [line.index, line]));
  return current.map((line) => {
    const twin = found.get(line.index);
    return twin ? { ...line, elsewhere: twin.elsewhere ?? null, typedTwin: twin.typedTwin ?? null } : line;
  });
}

/**
 * The warning when a payment is typed by hand that M-Pesa already brought in:
 * "a warning when something the app has picked is picked again" (5 Oct 2026).
 * The entries are what POST /possible-duplicates/check found among this
 * budget"s M-Pesa entries.
 */
export function alreadyFromMpesaMessage(entries: ReadonlyArray<{ description: string; date: string; amount: number; receipt?: string | null }>): { title: string; message: string } {
  const listed = entries.slice(0, 3).map((entry) =>
    `- ${entry.description} (KES ${entry.amount.toLocaleString("en-KE")}) on ${entry.date}${entry.receipt ? `, M-Pesa ${entry.receipt}` : ""}`,
  );
  const lines = [
    `Jamvi already has ${entries.length === 1 ? "this payment" : "payments like this"} from your M-Pesa:`,
    ...listed,
    ...(entries.length > 3 ? [`...and ${entries.length - 3} more.`] : []),
    "",
    "Saving it again would count it twice. Save only if it is a different payment.",
  ];
  return { title: "Already in from M-Pesa?", message: lines.join("\n") };
}

