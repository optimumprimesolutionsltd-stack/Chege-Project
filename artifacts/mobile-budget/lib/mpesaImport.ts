import type { DebtLink } from './mpesaDebts';

export type AlreadyRecorded = { date: string | null; description: string };

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
};

type PastPosting = { type: string; description: string; expenseCategory?: string | null; incomeSourceId?: number | null };

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
    if (posting.type !== 'disbursement' || !posting.expenseCategory) continue;
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
};

/** A category from this budget that suits the kind of payment, or '' when none does. */
export function defaultCategoryFor(line: PreviewLine, categoryNames: readonly string[]): string {
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
): Record<number, Choice> {
  const choices: Record<number, Choice> = {};
  for (const line of lines) {
    const suggested = suggestionFor(line, history, categoryNames, chargeCategory);
    choices[line.index] = { include: isRecordable(line), category: suggested, auto: suggested !== '' };
    if (line.direction === 'in') {
      const source = line.description ? suggestIncomeSource(line.description, history) : null;
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
): string {
  if (line.direction !== 'out') return '';
  const earlier = line.description ? suggestCategory(line.description, history) : '';
  // A Fuliza access fee is a bank charge: it goes where charges already go.
  return earlier || (line.type === 'fuliza_fee' ? chargeCategory : '') || defaultCategoryFor(line, categoryNames);
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
    const suggested = suggestionFor(line, history, categoryNames, chargeCategory);
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

/** Why a ticked line cannot be saved yet, or null when it can. */
export function problemWith(line: PreviewLine, choice: Choice | undefined): string | null {
  if (!choice?.include || !isRecordable(line)) return null;
  // Money lent is not spending, so it needs no category; paying a debt back does.
  if (line.direction === 'out' && choice.debt?.kind !== 'lend' && !choice.category.trim()) return 'Choose what it was for.';
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
  if (!choice.include || setByHand || sourceByHand || choice.debt) return 'changed';
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

export type Summary = { count: number; moneyIn: number; moneyOut: number; fees: number; missingCategory: number };

export function summarise(lines: readonly PreviewLine[], choices: Record<number, Choice>): Summary {
  const summary: Summary = { count: 0, moneyIn: 0, moneyOut: 0, fees: 0, missingCategory: 0 };
  for (const line of lines) {
    const choice = choices[line.index];
    if (!choice?.include || !isRecordable(line) || line.amount === null) continue;
    summary.count += 1;
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

  if (line.direction === 'in') {
    // A source is only for income: a repayment or a loan is not, so it takes none.
    const source = choice.incomeSourceId && !choice.debt ? ctx.incomeSources?.find((entry) => entry.id === choice.incomeSourceId) : undefined;
    return {
      kind: 'deposit' as const,
      main: {
        amount: line.amount,
        description,
        date,
        // A source belongs to one member, and the server only accepts it when the deposit names that member.
        madeById: source?.userId ?? ctx.userId,
        ...(source ? { incomeSourceId: source.id } : {}),
        accountId: ctx.accountId,
        // They paid back what they owed you, or you borrowed from them: neither
        // is income, and the server keeps both out of the income figures.
        ...(choice.debt?.kind === 'repaid' ? { settlesContributorId: choice.debt.partyId } : {}),
        ...(choice.debt?.kind === 'borrowed' ? { isBorrowing: true } : {}),
        ...(receipt ? { mpesaReceipt: receipt } : {}),
      },
      fee: null,
    };
  }

  // A shared group's spending defaults to the group, as it does on the Bank form.
  const madeById = ctx.isShared ? null : ctx.userId;
  // Lending is not a cost: no category, and linked to who it went to.
  const lending = choice.debt?.kind === 'lend';
  return {
    kind: 'disbursement' as const,
    main: {
      amount: line.amount,
      description,
      date,
      madeById,
      ...(lending
        ? { isLending: true, settlesContributorId: choice.debt!.partyId }
        : { expenseCategory: choice.category.trim(), destinationKind: 'category' as const }),
      accountId: ctx.accountId,
      ...(receipt ? { mpesaReceipt: receipt } : {}),
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
