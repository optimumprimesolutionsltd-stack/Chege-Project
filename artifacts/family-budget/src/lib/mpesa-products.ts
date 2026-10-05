import type { Choice, PreviewLine } from "./mpesa-import";

/**
 * Safaricom"s own products, bought or borrowed through M-Pesa. Nobody has to
 * say what airtime was for, or that a Fuliza draw was a loan, so lines for these
 * are filed and confirmed by Jamvi - asked for 5 Oct 2026, after a first
 * statement showed airtime among a thousand "Not sure yet" lines - and the
 * person only steps in to change one.
 *
 * Spending goes to a ledger of its own under the built-in M-Pesa heading (see
 * api-server lib/built-in-categories), next to M-Pesa charges and Fuliza charges:
 *
 *   M-Pesa
 *     M-Pesa charges, Fuliza charges, Airtime, Data bundles, Home Fibre
 *
 * Loans go to their lender in Who owes who, each under its own name: Fuliza,
 * M-Shwari, KCB M-PESA, Hustler Fund.
 *
 * Savings - M-Shwari, KCB M-PESA, Ziidi, Mali - go to their own savings account
 * in the Savings section (see savingsOf below).
 */
export type MpesaProductId = "airtime" | "bundles" | "home-fibre";

export type MpesaProduct = {
  id: MpesaProductId;
  /** What the line is, in words shown on it. */
  name: string;
  /** Its built-in ledger under M-Pesa. */
  ledger: string;
};

/** The built-in heading the ledgers sit under. */
export const MPESA_HEADING = "M-Pesa";

// First match wins, so Home Fibre is told apart from the bundles before "safaricom" alone could catch it.
const PRODUCTS: ReadonlyArray<MpesaProduct & { pattern: RegExp }> = [
  {
    id: "home-fibre",
    name: "Safaricom Home Fibre",
    ledger: "Home Fibre",
    pattern: /\bsafaricom\s*home\b|\bhome\s*fib(?:re|er)\b/i,
  },
  {
    id: "bundles",
    name: "Safaricom bundles",
    ledger: "Data bundles",
    // "SAFARICOM DATA BUNDLES", "Safaricom Offers" (Tunukiwa), "SAFARICOM POSTPAID BUNDLES",
    // and the statement"s own "Buy Bundles Online" and "Customer Bundle Purchase".
    pattern: /\bsafaricom\s+(?:data|bundles?|offers?|post\s*paid)\b|\bpost\s*paid\s+bundles?\b|\btunukiwa\b|\bbuy\s+bundles\b|\bcustomer\s+bundle\s+purchase\b/i,
  },
  {
    id: "airtime",
    name: "Safaricom airtime",
    ledger: "Airtime",
    // A statement"s "Airtime Purchase" and "Recharge for Customer"; a message"s "bought Ksh20.00 of airtime".
    pattern: /^airtime\b|\bairtime\s+purchase\b|\brecharge\s+for\s+customer\b|\bof\s+airtime\b/i,
  },
];

const AIRTIME = PRODUCTS.find((product) => product.id === "airtime")!;

/** Every product"s ledger, in the order they sit under M-Pesa. */
export const PRODUCT_LEDGERS: readonly string[] = ["Airtime", "Data bundles", "Home Fibre"];

const wordsOf = (line: Pick<PreviewLine, "description" | "original">) =>
  // The name M-Pesa gave as well as the person"s own nickname for it.
  [line.original, line.description].filter(Boolean).join(" | ");

/** The Safaricom product a payment out was for, or null when it is anything else. */
export function productOf(line: Pick<PreviewLine, "direction" | "type" | "description" | "original">): MpesaProduct | null {
  if (line.direction !== "out" || loanOf(line)) return null;
  const words = wordsOf(line);
  const found = words ? PRODUCTS.find((product) => product.pattern.test(words)) : undefined;
  if (found) return found;
  return line.type === "airtime_purchase" ? AIRTIME : null;
}

const lower = (value: string) => value.trim().toLocaleLowerCase("en-KE");

/** Where a product is filed: its ledger, spelt the way the budget spells it. */
export function productCategory(product: MpesaProduct, categoryNames: readonly string[]): string {
  return categoryNames.find((name) => lower(name) === lower(product.ledger)) ?? product.ledger;
}

/**
 * Ledgers this save files lines into that the budget does not have yet. The
 * server makes them under M-Pesa whenever categories are listed, so this only
 * matters when that has not happened; one made here is moved under the
 * heading the next time.
 */
export function ledgersToMake(
  lines: readonly PreviewLine[],
  choices: Record<number, Choice>,
  categoryNames: readonly string[],
): string[] {
  const have = new Set(categoryNames.map(lower));
  const wanted = new Set<string>();
  for (const line of lines) {
    const choice = choices[line.index];
    if (!choice?.include || line.direction !== "out") continue;
    // Only spending filed here: a line sent to a debt, a move or another budget does not use it.
    if (choice.debt || choice.transferTo || choice.savingsGoalId || choice.contributorId || choice.otherBudget) continue;
    const ledger = PRODUCT_LEDGERS.find((name) => lower(name) === lower(choice.category));
    if (ledger && !have.has(lower(ledger))) wanted.add(ledger);
  }
  return [...wanted];
}

/** The line"s note while it is still Jamvi"s filing: what it is and where it went. */
export const productNote = (product: MpesaProduct, category: string): string =>
  `${product.name}: Jamvi files it under ${category}.`;

/* ------------------------------------------------------------------ loans */

export type LenderId = "fuliza" | "mshwari" | "kcb" | "hustler";

export type Lender = {
  id: LenderId;
  /** Its name in Who owes who. */
  name: string;
  /** A party already in Who owes who that is this lender. */
  party: RegExp;
};

export const LENDERS: readonly Lender[] = [
  // Fuliza was "Safaricom PLC" in Who owes who before 5 Oct 2026; that party is still Fuliza.
  { id: "fuliza", name: "Fuliza", party: /fuliza|^safaricom\b/i },
  { id: "mshwari", name: "M-Shwari", party: /m-?\s?shwari/i },
  { id: "kcb", name: "KCB M-PESA", party: /kcb\s*m-?\s?pesa/i },
  { id: "hustler", name: "Hustler Fund", party: /hustler/i },
];

const lender = (id: LenderId) => LENDERS.find((entry) => entry.id === id)!;

// How each loan is worded, in a message or a statement row. Fuliza is read from the statement as a whole (lib/statementImport).
const LOAN_WORDS: ReadonlyArray<[RegExp, LenderId]> = [
  [/\bm-?\s?shwari\s+loan\b/i, "mshwari"],
  [/\bkcb\s*m-?\s?pesa\s+loan\b/i, "kcb"],
  [/\bhustler\s*fund\b/i, "hustler"],
];

/**
 * A loan drawn (money in: borrowed, not income) or paid back (money out: the
 * debt going down, not spending - what the loan bought was recorded when it was
 * spent). Null for anything that is not one of these lenders.
 */
export function loanOf(line: Pick<PreviewLine, "direction" | "type" | "description" | "original">): { lender: Lender; kind: "borrowed" | "pay-back" } | null {
  if (line.type === "fuliza_borrowed") return { lender: lender("fuliza"), kind: "borrowed" };
  if (line.type === "fuliza_repaid") return { lender: lender("fuliza"), kind: "pay-back" };
  if (!line.direction) return null;
  const words = wordsOf(line);
  const found = words ? LOAN_WORDS.find(([pattern]) => pattern.test(words)) : undefined;
  if (!found) return null;
  return { lender: lender(found[1]), kind: line.direction === "in" ? "borrowed" : "pay-back" };
}

/* --------------------------------------------------------------- savings */

export type SavingsAccountId = "mshwari" | "kcb" | "ziidi" | "mali";

export type SavingsAccount = {
  id: SavingsAccountId;
  /** Its name in the Savings section. */
  name: string;
  /** How a line names it. Loans from the same product are told apart first (loanOf). */
  pattern: RegExp;
  /** A savings entry already there that is this account. */
  goal: RegExp;
};

/**
 * Savings products reached through M-Pesa. Money moved into one leaves M-Pesa
 * and money taken out comes back - neither is spending or income - so each is a
 * savings account in the Savings section (a savings goal with no target, see
 * api-server lib/savings-accounts), made the first time a statement needs it.
 * The M-Pesa line still reconciles: every move is recorded on it.
 *
 * Statement wording: "M-Shwari Deposit" / "M-Shwari Withdraw", "KCB M-PESA
 * Deposit" / "KCB M-PESA Withdraw"; messages: "transferred to M-Shwari",
 * "sent to ZIIDI", "received ... from ZIIDI". Mali is matched only as
 * "M-PESA Mali" or "Mali" followed by what was done, because "Mali" alone is
 * an ordinary word ("Mali Hardware"). Asked for 5 Oct 2026.
 */
export const SAVINGS_ACCOUNTS: readonly SavingsAccount[] = [
  { id: "mshwari", name: "M-Shwari", pattern: /\bm-?\s?shwari\b/i, goal: /^m-?\s?shwari\b/i },
  { id: "kcb", name: "KCB M-PESA", pattern: /\bkcb\s*m-?\s?pesa\b/i, goal: /^kcb\s*m-?\s?pesa\b/i },
  { id: "ziidi", name: "Ziidi", pattern: /\bziidi\b/i, goal: /^ziidi\b/i },
  { id: "mali", name: "Mali", pattern: /\bm-?\s?pesa\s+mali\b|\bmali\s+(?:deposit|withdraw(?:al)?|savings|investment|top\s*up)\b/i, goal: /^(?:m-?\s?pesa\s+)?mali\b/i },
];

/**
 * Money moved into a savings product (out of M-Pesa) or taken out of it (into
 * M-Pesa). Null for anything else, a loan from the same product, or an amount
 * with cents: savings move in whole shillings, so such a line is left to the
 * person.
 */
export function savingsOf(line: Pick<PreviewLine, "direction" | "type" | "description" | "original" | "amount">): { account: SavingsAccount; into: boolean } | null {
  if (!line.direction || loanOf(line)) return null;
  if (line.amount === null || !Number.isInteger(line.amount)) return null;
  const words = wordsOf(line);
  const account = words ? SAVINGS_ACCOUNTS.find((entry) => entry.pattern.test(words)) : undefined;
  return account ? { account, into: line.direction === "out" } : null;
}

type GoalLite = { id: number; name: string };

/**
 * A savings account (M-Shwari, KCB M-PESA, Ziidi, Mali) rather than a goal: it has
 * no target, never completes, and shows its balance (api-server lib/savings-accounts).
 */
export const isSavingsAccount = (goal: { targetAmount: number }): boolean => goal.targetAmount <= 0;

/** This account in the Savings section, when it is there. */
export const findSavingsGoal = (account: SavingsAccount, goals: readonly GoalLite[]): GoalLite | null =>
  goals.find((goal) => account.goal.test(goal.name.trim())) ?? null;

/** The savings accounts ticked lines move money into or out of, that they are not linked to yet. */
export function savingsNeeded(lines: readonly PreviewLine[], choices: Record<number, Choice>): SavingsAccount[] {
  const needed = new Map<SavingsAccountId, SavingsAccount>();
  for (const line of lines) {
    const found = savingsOf(line);
    const choice = choices[line.index];
    if (found && choice?.include && !choice.savingsGoalId && !choice.debt && !choice.transferTo && !choice.otherBudget && !choice.contributorId) {
      needed.set(found.account.id, found.account);
    }
  }
  return [...needed.values()];
}

/** Each such line linked to its account: a move into or out of savings, with no category or source. */
export function withSavingsAccounts(lines: readonly PreviewLine[], choices: Record<number, Choice>, goalIds: Partial<Record<SavingsAccountId, number>>): Record<number, Choice> {
  const next = { ...choices };
  for (const line of lines) {
    const choice = next[line.index];
    const found = savingsOf(line);
    const goalId = found ? goalIds[found.account.id] : undefined;
    if (!choice?.include || !found || goalId == null) continue;
    if (choice.savingsGoalId || choice.debt || choice.transferTo || choice.otherBudget || choice.contributorId) continue;
    next[line.index] = { ...choice, savingsGoalId: goalId, category: "", auto: false, incomeSourceId: null, sourceAuto: false };
  }
  return next;
}
