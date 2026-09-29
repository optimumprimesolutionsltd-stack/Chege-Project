import type { DebtLink } from './mpesaDebts';
import { fuzzyCategory, isFeePosting, ruleCategory, wordCategory, type PayeeRules } from './payeeLearning';

export type AlreadyRecorded = {
  date: string | null;
  description: string;
  /** The category it was recorded under, when it is spending. */
  category?: string | null;
  /** True for ordinary spending, whose category can be changed without touching anything else. */
  editable?: boolean;
};

/** One line of the review list, as the API's preview returns it. */
export type PreviewLine = {
  index: number;
  status: 'ready' | 'skipped';
  reason: string | null;
  receipt: string | null;
  direction: 'out' | 'in' | null;
  type: string | null;
  amount: number | null;
  description: string | null;
  /** The name the message gave, kept when the person's nickname for the payee is shown as the description. */
  original?: string;
  /** False when the message named nobody, so the description is only a generic label. */
  named?: boolean;
  date: string | null;
  fee: number | null;
  mpesaBalance: number | null;
  alreadyRecorded: AlreadyRecorded | null;
  /** The till or paybill number, when the source carries one (a statement does, a message does not). */
  payeeNumber?: string | null;
};

/**
 * `auto` is true while the category is Jamvi's suggestion and the person has not chosen one.
 * `debt` links a payment to or from a person to what stands between you.
 */
export type Choice = {
  include: boolean;
  category: string;
  auto?: boolean;
  debt?: DebtLink | null;
  /** For money in: which of the person's income sources it came from. Optional. */
  incomeSourceId?: number | null;
  /** True while that source is Jamvi's suggestion and the person has not chosen one. */
  sourceAuto?: boolean;
  /**
   * The other of the person's own accounts, when this line is only money moving
   * between two of them through M-Pesa (a bank paying into M-Pesa, or M-Pesa paying
   * out to another bank). Neither income nor spending.
   */
  transferTo?: number | null;
  /** The person ticked "remember this": keep this category for this payee once it is saved. */
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
};

/**
 * Where a line goes, in one word. A line goes to exactly one place: a category (ordinary
 * spending or income), a debt with a person or company, a move between the person's own
 * accounts, a savings goal, a group member's contribution, or a different budget entirely.
 * Everything that has to treat these differently asks this instead of checking each field
 * on its own.
 */
export type Destination = 'category' | 'debt' | 'transfer' | 'savings' | 'contribution' | 'other-budget';

export function destinationOf(choice: Choice | undefined): Destination {
  if (!choice) return 'category';
  if (choice.otherBudget) return 'other-budget';
  if (choice.transferTo) return 'transfer';
  if (choice.savingsGoalId) return 'savings';
  if (choice.contributorId) return 'contribution';
  if (choice.debt) return 'debt';
  return 'category';
}

/**
 * Money that is not this budget's own income or spending: it moves between the person's own
 * places, or it is being recorded in a different budget entirely. Needs no category, no debt
 * link and no income source here.
 */
export const isMove = (choice: Choice | undefined): boolean => {
  const destination = destinationOf(choice);
  return destination === 'transfer' || destination === 'savings' || destination === 'other-budget';
};

type PastPosting = { type: string; description: string; expenseCategory?: string | null; incomeSourceId?: number | null; chargeForTransactionId?: number | null };

const clean = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-KE');

/**
 * The category this same payee was filed under before, so the second payment
 * to Kenya Power is one tap. Learned from what is already in the books: the
 * category used most often for that description, or '' when there is none.
 */
export function suggestCategory(description: string, history: readonly PastPosting[]): string {
  const wanted = clean(description);
  if (!wanted) return '';
  const counts = new Map<string, number>();
  for (const posting of history) {
    if (posting.type !== 'disbursement' || !posting.expenseCategory || isFeePosting(posting)) continue;
    if (clean(posting.description) !== wanted) continue;
    counts.set(posting.expenseCategory, (counts.get(posting.expenseCategory) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [category, count] of counts) {
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  }
  return best;
}

/**
 * The income source money from this sender was filed under before, so a client
 * who pays every month is tagged once. The one used most often for that
 * description among earlier deposits, or null when there is none.
 */
export function suggestIncomeSource(description: string, history: readonly PastPosting[]): number | null {
  const wanted = clean(description);
  if (!wanted) return null;
  const counts = new Map<number, number>();
  for (const posting of history) {
    if (posting.type !== 'deposit' || !posting.incomeSourceId) continue;
    if (clean(posting.description) !== wanted) continue;
    counts.set(posting.incomeSourceId, (counts.get(posting.incomeSourceId) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}

/** Can this line be recorded at all, before anybody has chosen anything? */
export const isRecordable = (line: PreviewLine): boolean =>
  line.status === 'ready' && !line.alreadyRecorded && line.amount !== null && line.direction !== null;

// Kinds of payment whose category is obvious from the kind alone, and the words
// a budget's own category for it is likely to use. Only a category that already
// exists is ever suggested; nothing is created, and the person can change it.
const KIND_DEFAULTS: Record<string, readonly string[]> = {
  airtime_purchase: ['airtime', 'data', 'phone', 'communication', 'bundle'],
  cash_withdrawal: ['cash', 'withdraw'],
  fuliza_fee: ['bank charge', 'charge', 'fee', 'fuliza'],
  transaction_charge: ['m-pesa charges', 'transaction charges', 'bank charge', 'charge', 'fee'],
};

// A payee that names a group people pay into, and the words a category for it is likely to use.
const GROUP_PAYEE = /\b(chama|sacco|welfare|merry|self[- ]?help|group)\b/i;
const GROUP_CATEGORY_WORDS = ['chama', 'sacco', 'contribution', 'welfare', 'merry'];

/** A category from this budget that suits the kind of payment, or '' when none does. */
export function defaultCategoryFor(line: PreviewLine, categoryNames: readonly string[]): string {
  if (line.direction === 'out' && line.description && GROUP_PAYEE.test(line.description)) {
    const named = categoryNames.find((name) => GROUP_CATEGORY_WORDS.some((word) => name.toLowerCase().includes(word)));
    if (named) return named;
  }
  const words = line.type ? KIND_DEFAULTS[line.type] : undefined;
  if (!words) return '';
  for (const word of words) {
    const match = categoryNames.find((name) => name.toLocaleLowerCase('en-KE').includes(word));
    if (match) return match;
  }
  return '';
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
  chargeCategory = '',
  rules: PayeeRules = {},
  /** False for a member of a shared group: only an owner or admin can record payments out, so those start unticked. */
  canRecordOut = true,
): Record<number, Choice> {
  const choices: Record<number, Choice> = {};
  for (const line of lines) {
    const suggested = suggestionFor(line, history, categoryNames, chargeCategory, rules);
    choices[line.index] = { include: isRecordable(line) && (canRecordOut || line.direction !== 'out'), category: suggested, auto: suggested !== '' };
    if (line.direction === 'in') {
      // Fuliza still owed is borrowed, never income, so it is offered no source.
      const source = line.description && line.type !== 'fuliza_borrowed' ? suggestIncomeSource(line.description, history) : null;
      choices[line.index] = { ...choices[line.index], incomeSourceId: source, sourceAuto: source !== null };
    }
  }
  return choices;
}

function suggestionFor(
  line: PreviewLine,
  history: readonly PastPosting[],
  categoryNames: readonly string[],
  chargeCategory: string,
  rules: PayeeRules = {},
): string {
  if (line.direction !== 'out') return '';
  // Built-in categories win: a Fuliza fee goes to Fuliza charges when the
  // budget has it, and a lone M-Pesa charge to the charges category - before
  // any guess from a payee, which a charge does not have. A budget without
  // Fuliza charges yet keeps the old order below.
  if (line.type === 'fuliza_fee') {
    const builtIn = categoryNames.find((name) => name.trim().toLowerCase() === 'fuliza charges');
    if (builtIn) return builtIn;
  }
  if (line.type === 'transaction_charge') return chargeCategory || defaultCategoryFor(line, categoryNames);
  const description = line.description ?? '';
  // A rule the person kept, then this exact payee's history, then payees with a similar name,
  // then a word that has nearly always meant one category in their own books.
  const kept = description ? ruleCategory(description, rules, line.payeeNumber) : '';
  const earlier = description ? suggestCategory(description, history) : '';
  const similar = description && line.named !== false ? fuzzyCategory(description, history, categoryNames) : '';
  const byWord = description && line.named !== false ? wordCategory(description, history, categoryNames) : '';
  return (
    (kept && (categoryNames.length === 0 || categoryNames.includes(kept)) ? kept : '') ||
    earlier ||
    similar ||
    byWord ||
    (line.type === 'fuliza_fee' ? chargeCategory : '') ||
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
  chargeCategory = '',
  rules: PayeeRules = {},
): Record<number, Choice> {
  const next: Record<number, Choice> = { ...choices };
  for (const line of lines) {
    const current = choices[line.index];
    if (!current) continue;
    if (line.direction === 'in') {
      // A source the person chose is never replaced; a suggestion is offered again.
      if (current.incomeSourceId == null || current.sourceAuto) {
        const source = line.description ? suggestIncomeSource(line.description, history) : null;
        next[line.index] = { ...current, incomeSourceId: source, sourceAuto: source !== null };
      }
      continue;
    }
    if (current.category && !current.auto) continue;
    const suggested = suggestionFor(line, history, categoryNames, chargeCategory, rules);
    next[line.index] = { ...current, category: suggested, auto: suggested !== '' };
  }
  return next;
}

/**
 * The person picks where money in came from. It is theirs from then on, and the
 * same sender's other lines that have no source get it too, so a client's twelve
 * payments take one choice. Picking none clears it.
 */
export function chooseIncomeSource(
  lines: readonly PreviewLine[],
  choices: Record<number, Choice>,
  index: number,
  sourceId: number | null,
): Record<number, Choice> {
  const chosen = lines.find((line) => line.index === index);
  const next: Record<number, Choice> = { ...choices, [index]: { ...choices[index], incomeSourceId: sourceId, sourceAuto: false } };
  if (!chosen?.description || sourceId === null) return next;
  const sender = clean(chosen.description);
  for (const line of lines) {
    if (line.index === index || line.direction !== 'in' || !line.description) continue;
    if (clean(line.description) !== sender) continue;
    if (choices[line.index]?.incomeSourceId) continue;
    next[line.index] = { ...choices[line.index], incomeSourceId: sourceId, sourceAuto: true };
  }
  return next;
}

/**
 * The person picks a category by hand. It is theirs from then on, and the same
 * payee's other lines that still have none get it too, so twelve airtime top-ups
 * take one choice, not twelve.
 */
export function chooseCategory(
  lines: readonly PreviewLine[],
  choices: Record<number, Choice>,
  index: number,
  category: string,
): Record<number, Choice> {
  const chosen = lines.find((line) => line.index === index);
  const next: Record<number, Choice> = { ...choices, [index]: { ...choices[index], category, auto: false } };
  if (!chosen?.description || !category) return next;
  const payee = clean(chosen.description);
  for (const line of lines) {
    if (line.index === index || line.direction !== 'out' || !line.description) continue;
    if (clean(line.description) !== payee) continue;
    if (choices[line.index]?.category) continue;
    next[line.index] = { ...choices[line.index], category, auto: true };
  }
  return next;
}

/** A line in words that find it in a long list: who, how much, and when. */
export function lineLabel(line: PreviewLine): string {
  const money = line.amount === null ? '' : `KES ${line.amount.toLocaleString('en-KE')}`;
  const detail = [money, line.date].filter(Boolean).join(', ');
  return `${line.description ?? 'A payment'}${detail ? ` (${detail})` : ''}`;
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
  return pasted.slice(at, at + length * 2).replace(/\s+/g, ' ').trim().slice(0, length);
}

/**
 * Fuliza owed from the last statement, paid back to the Fuliza debt with no
 * category of its own. Filed under a category it would count twice: once as
 * what the loan bought, once as paying it back.
 */
export const paysOffFuliza = (line: PreviewLine, choice: Choice): boolean =>
  line.type === 'fuliza_repaid' && choice.debt?.kind === 'pay-back' && !choice.category.trim();

/** Why a ticked line cannot be saved yet, or null when it can. */
export function problemWith(line: PreviewLine, choice: Choice | undefined): string | null {
  if (!choice?.include || !isRecordable(line)) return null;
  if (choice.otherBudget) {
    if (!choice.otherBudget.accountId) return `Choose an account in ${choice.otherBudget.groupName}.`;
    if (line.direction === 'out' && !choice.otherBudget.category?.trim()) return `Choose what it was for in ${choice.otherBudget.groupName}.`;
    return null;
  }
  // Money moved between the person's own places is not spending, so it needs no category.
  if (isMove(choice)) return null;
  // Money lent is not spending, so it needs no category; paying a debt back does.
  // Repaying Fuliza needs no category: saving links it to Fuliza in Who owes who.
  const fulizaRepayment = line.type === 'fuliza_repaid' && (paysOffFuliza(line, choice) || !choice.debt);
  if (line.direction === 'out' && choice.debt?.kind !== 'lend' && !fulizaRepayment && !choice.category.trim()) return 'Choose what it was for.';
  return null;
}

/**
 * Where a line stands in the person's review of the list:
 * `needs` cannot be saved until something is chosen; `changed` is something they
 * set or changed themselves (a category, a debt, a source, or unticking it);
 * `suggested` is still exactly what Jamvi suggested and has not been touched.
 * Lines that cannot be recorded at all are not part of the review.
 */
export type ReviewStatus = 'needs' | 'changed' | 'suggested';

export function reviewStatus(line: PreviewLine, choice: Choice | undefined): ReviewStatus | null {
  if (!isRecordable(line) || !choice) return null;
  if (problemWith(line, choice)) return 'needs';
  const setByHand = Boolean(choice.category.trim()) && choice.auto === false;
  const sourceByHand = choice.incomeSourceId != null && choice.sourceAuto === false;
  if (!choice.include || setByHand || sourceByHand || destinationOf(choice) !== 'category') return 'changed';
  return 'suggested';
}

export type ReviewView = 'all' | ReviewStatus;

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
  /** Recorded in a different budget entirely: not this budget's income or spending either. */
  toOtherBudgets: number;
};

export function summarise(lines: readonly PreviewLine[], choices: Record<number, Choice>): Summary {
  const summary: Summary = { count: 0, moneyIn: 0, moneyOut: 0, fees: 0, missingCategory: 0, moves: 0, toOtherBudgets: 0 };
  for (const line of lines) {
    const choice = choices[line.index];
    if (!choice?.include || !isRecordable(line) || line.amount === null) continue;
    summary.count += 1;
    if (isMove(choice)) {
      // A move between the person's own places, or a line going to a different budget
      // entirely, is neither money in nor money out here; only its charge is a cost.
      if (destinationOf(choice) === 'other-budget') summary.toOtherBudgets += 1;
      else summary.moves += 1;
      if (line.direction === 'out') summary.fees += line.fee ?? 0;
      continue;
    }
    if (line.direction === 'in') summary.moneyIn += line.amount;
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
  const description = line.description ?? 'M-Pesa';
  const receipt = line.receipt ?? undefined;

  // The charge on money moved out of M-Pesa is the same wherever it went.
  const moveFee =
    line.direction === 'out' && line.fee && line.fee > 0 && ctx.chargeCategory.trim()
      ? {
          amount: line.fee,
          description: `Bank charge — ${description}`,
          date,
          madeById: ctx.isShared ? null : ctx.userId,
          expenseCategory: ctx.chargeCategory.trim(),
          destinationKind: 'category' as const,
          accountId: ctx.accountId,
        }
      : null;

  // Recorded in a different budget entirely, by its own account and category or income source.
  // The M-Pesa charge, if any, is still a real cost on this budget's own account, so it stays
  // here — but it cannot be linked to the entry it came with, which lives in another budget's
  // own history now.
  if (choice.otherBudget) {
    const target = choice.otherBudget;
    return {
      kind: 'other-budget' as const,
      groupId: target.groupId,
      direction: line.direction,
      main:
        line.direction === 'in'
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
              expenseCategory: (target.category ?? '').trim(),
              destinationKind: 'category' as const,
              ...(receipt ? { mpesaReceipt: receipt } : {}),
            },
      fee: moveFee,
    };
  }

  // Into or out of a savings goal: one savings transfer, whole shillings, with the receipt on it.
  if (choice.savingsGoalId) {
    return {
      kind: 'savings' as const,
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

  // Between the person's own accounts: a transfer, with the receipt on the M-Pesa side, and any charge as before.
  if (choice.transferTo) {
    const out = line.direction === 'out';
    return {
      kind: 'transfer' as const,
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

  // A group member's contribution: recorded under their name on the who-has-paid sheet.
  if (line.direction === 'in' && choice.contributorId) {
    return {
      kind: 'deposit' as const,
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

  if (line.direction === 'in') {
    // A source is only for income: a repayment or a loan is not, so it takes none.
    const source = choice.incomeSourceId && !choice.debt && line.type !== 'fuliza_borrowed' ? ctx.incomeSources?.find((entry) => entry.id === choice.incomeSourceId) : undefined;
    // A source belongs to one member, and the server only accepts the deposit
    // when it names exactly that member as who made it - not merely any
    // current member. A source whose owner is not currently a member
    // (removed, or a data problem) can't be paired with anyone truthfully,
    // so the source is dropped rather than guessing a depositor for it -
    // recording the deposit plainly beats failing the whole entry over an
    // attribution nobody was trying to get right just now.
    const sourceOwnerIsMember = source?.userId != null && (!ctx.memberIds || ctx.memberIds.includes(source.userId));
    const usableSource = sourceOwnerIsMember ? source : undefined;
    return {
      kind: 'deposit' as const,
      main: {
        amount: line.amount,
        description,
        date,
        madeById: usableSource?.userId ?? ctx.userId,
        ...(usableSource ? { incomeSourceId: usableSource.id } : {}),
        accountId: ctx.accountId,
        // They paid back what they owed you, or you borrowed from them: neither
        // is income, and the server keeps both out of the income figures.
        ...(choice.debt?.kind === 'repaid' ? { settlesContributorId: choice.debt.partyId } : {}),
        ...(choice.debt?.kind === 'borrowed' || (!choice.debt && line.type === 'fuliza_borrowed') ? { isBorrowing: true } : {}),
        ...(receipt ? { mpesaReceipt: receipt } : {}),
        ...(choice.notes?.trim() ? { notes: choice.notes.trim() } : {}),
      },
      fee: null,
    };
  }

  // A shared group's spending defaults to the group, as it does on the Bank form.
  const madeById = ctx.isShared ? null : ctx.userId;
  // Lending is not a cost: no category, and linked to who it went to.
  const lending = choice.debt?.kind === 'lend';
  // Nor is paying Fuliza back: what the loan bought was recorded as spending
  // when it was bought, so the repayment only clears the debt.
  const clearing = paysOffFuliza(line, choice);
  return {
    kind: 'disbursement' as const,
    main: {
      amount: line.amount,
      description,
      date,
      madeById,
      ...(lending
        ? { isLending: true, settlesContributorId: choice.debt!.partyId }
        : clearing
          ? { settlesContributorId: choice.debt!.partyId }
          : { expenseCategory: choice.category.trim(), destinationKind: 'category' as const }),
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
            destinationKind: 'category' as const,
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
  const normalized = text.replace(/\r\n?/g, '\n').trim();
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
  if (line.status === 'skipped') return line.type === null || line.type === 'other';
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
  return PHONE_PATTERNS.reduce((text, pattern) => text.replace(pattern, '<PHONE>'), message);
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
  lines.filter((line) => line.alreadyRecorded?.editable === true && line.receipt !== null && line.direction === 'out');

/** What to send to change categories: only entries given a category that differs from the one they have. */
export function categoryChanges(
  lines: readonly PreviewLine[],
  chosen: Record<number, string>,
): Array<{ receipt: string; category: string }> {
  const changes: Array<{ receipt: string; category: string }> = [];
  for (const line of recategorisable(lines)) {
    const category = (chosen[line.index] ?? '').trim();
    if (!category || category === line.alreadyRecorded?.category) continue;
    changes.push({ receipt: line.receipt as string, category });
  }
  return changes;
}

// Choosing one place for a line un-chooses the others, so a line is only ever in one.
const noOtherPlace = { debt: null, incomeSourceId: null, sourceAuto: false, transferTo: null, savingsGoalId: null, contributorId: null, otherBudget: null } as const;

/** Sets, or with null clears, the other account of a move between the person's own accounts. */
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
export function chooseOtherBudget(choices: Record<number, Choice>, index: number, otherBudget: Choice['otherBudget'] | null): Record<number, Choice> {
  const current = choices[index];
  if (!current) return choices;
  return { ...choices, [index]: otherBudget ? { ...current, ...noOtherPlace, otherBudget } : { ...current, otherBudget: null } };
}

/** Savings transfers take whole shillings only, and only a payment that could be recorded at all. */
export const canUseSavings = (line: PreviewLine): boolean =>
  isRecordable(line) && line.amount !== null && Number.isInteger(line.amount) && !line.type?.startsWith('fuliza_');

/** Words in a payee that say it is a bank: a payment to one is likely a move between the person's own accounts. */
export const BANK_WORDS = /\b(bank|equity|kcb|co-?op(erative)?|absa|ncba|stanbic|dtb|i&m|family|sidian|gulf|hf|nba|diamond|standard chartered|citi|hfc|ecobank|uba|prime bank|credit bank|victoria|guaranty|gtb|m-?oriental|paramount|spire)\b/i;

/**
 * Lines that look like money passing through M-Pesa between the person's own accounts:
 * a payment in from a bank, and, the same day, a payment out of the same amount, or a
 * smaller one to a bank (some was sent on and some stayed in M-Pesa, or went on charges).
 * Only a hint: nothing is decided for the person, and a payment out is only hinted when
 * it is a paybill or matches the amount exactly, so everyday spending is left alone.
 */
export function throughMpesaHints(lines: readonly PreviewLine[]): Set<number> {
  const hints = new Set<number>();
  const fromBank = lines.filter((line) => line.type === 'bank_receipt' && line.amount !== null && isRecordable(line));
  for (const incoming of fromBank) {
    hints.add(incoming.index);
    for (const line of lines) {
      if (line.direction !== 'out' || line.amount === null || line.date !== incoming.date || !isRecordable(line) || hints.has(line.index)) continue;
      const sameAmount = line.amount === incoming.amount;
      const toABank = line.type === 'paybill_payment' && line.amount <= (incoming.amount as number) && BANK_WORDS.test(line.description ?? '');
      if (sameAmount || toABank) hints.add(line.index);
    }
  }
  return hints;
}
