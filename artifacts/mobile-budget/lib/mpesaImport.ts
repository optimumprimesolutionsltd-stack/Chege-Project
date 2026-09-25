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
  /** False when the message named nobody, so the description is only a generic label. */
  named?: boolean;
  date: string | null;
  fee: number | null;
  mpesaBalance: number | null;
  alreadyRecorded: AlreadyRecorded | null;
};

/** `auto` is true while the category is Jamvi's suggestion and the person has not chosen one. */
export type Choice = { include: boolean; category: string; auto?: boolean };

type PastPosting = { type: string; description: string; expenseCategory?: string | null };

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

/** Can this line be recorded at all, before anybody has chosen anything? */
export const isRecordable = (line: PreviewLine): boolean =>
  line.status === 'ready' && !line.alreadyRecorded && line.amount !== null && line.direction !== null;

// Kinds of payment whose category is obvious from the kind alone, and the words
// a budget's own category for it is likely to use. Only a category that already
// exists is ever suggested; nothing is created, and the person can change it.
const KIND_DEFAULTS: Record<string, readonly string[]> = {
  airtime_purchase: ['airtime', 'data', 'phone', 'communication', 'bundle'],
  cash_withdrawal: ['cash', 'withdraw'],
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
): Record<number, Choice> {
  const choices: Record<number, Choice> = {};
  for (const line of lines) {
    const suggested =
      line.direction === 'out'
        ? (line.description ? suggestCategory(line.description, history) : '') || defaultCategoryFor(line, categoryNames)
        : '';
    choices[line.index] = { include: isRecordable(line), category: suggested, auto: suggested !== '' };
  }
  return choices;
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
  if (line.direction === 'out' && !choice.category.trim()) return 'Choose what it was for.';
  return null;
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
    return {
      kind: 'deposit' as const,
      main: {
        amount: line.amount,
        description,
        date,
        madeById: ctx.userId,
        accountId: ctx.accountId,
        ...(receipt ? { mpesaReceipt: receipt } : {}),
      },
      fee: null,
    };
  }

  // A shared group's spending defaults to the group, as it does on the Bank form.
  const madeById = ctx.isShared ? null : ctx.userId;
  return {
    kind: 'disbursement' as const,
    main: {
      amount: line.amount,
      description,
      date,
      madeById,
      expenseCategory: choice.category.trim(),
      destinationKind: 'category' as const,
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

const PHONE_PATTERNS = [
  /\+?254[\s-]?(?:7\d{2}|1\d{2})[\s-]?\d{3}[\s-]?\d{3}/g,
  /\b0(?:7\d{2}|1\d{2})[\s-]?\d{3}[\s-]?\d{3}\b/g,
];

/** Hides phone numbers before somebody sees the text they are about to send. */
export function redactForReport(message: string): string {
  return PHONE_PATTERNS.reduce((text, pattern) => text.replace(pattern, '<PHONE>'), message);
}
