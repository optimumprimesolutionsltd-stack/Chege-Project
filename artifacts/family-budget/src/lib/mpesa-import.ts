export type AlreadyRecorded = { date: string | null; description: string };

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
  /** False when the message named nobody, so the description is only a generic label. */
  named?: boolean;
  date: string | null;
  fee: number | null;
  mpesaBalance: number | null;
  alreadyRecorded: AlreadyRecorded | null;
};

export type Choice = { include: boolean; category: string };

type PastPosting = { type: string; description: string; expenseCategory?: string | null };

const clean = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-KE");

/**
 * The category this same payee was filed under before, so the second payment
 * to Kenya Power is one tap. Learned from what is already in the books: the
 * category used most often for that description, or "" when there is none.
 */
export function suggestCategory(description: string, history: readonly PastPosting[]): string {
  const wanted = clean(description);
  if (!wanted) return "";
  const counts = new Map<string, number>();
  for (const posting of history) {
    if (posting.type !== "disbursement" || !posting.expenseCategory) continue;
    if (clean(posting.description) !== wanted) continue;
    counts.set(posting.expenseCategory, (counts.get(posting.expenseCategory) ?? 0) + 1);
  }
  let best = "";
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
  line.status === "ready" && !line.alreadyRecorded && line.amount !== null && line.direction !== null;

/** Recordable lines start ticked; money out starts with the category it was filed under before. */
export function initialChoices(
  lines: readonly PreviewLine[],
  history: readonly PastPosting[],
): Record<number, Choice> {
  const choices: Record<number, Choice> = {};
  for (const line of lines) {
    choices[line.index] = {
      include: isRecordable(line),
      category: line.direction === "out" && line.description ? suggestCategory(line.description, history) : "",
    };
  }
  return choices;
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

/** Why a ticked line cannot be saved yet, or null when it can. */
export function problemWith(line: PreviewLine, choice: Choice | undefined): string | null {
  if (!choice?.include || !isRecordable(line)) return null;
  if (line.direction === "out" && !choice.category.trim()) return "Choose what it was for.";
  return null;
}

export type Summary = { count: number; moneyIn: number; moneyOut: number; fees: number; missingCategory: number };

export function summarise(lines: readonly PreviewLine[], choices: Record<number, Choice>): Summary {
  const summary: Summary = { count: 0, moneyIn: 0, moneyOut: 0, fees: 0, missingCategory: 0 };
  for (const line of lines) {
    const choice = choices[line.index];
    if (!choice?.include || !isRecordable(line) || line.amount === null) continue;
    summary.count += 1;
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

  if (line.direction === "in") {
    return {
      kind: "deposit" as const,
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

  // A shared group"s spending defaults to the group, as it does on the Bank form.
  const madeById = ctx.isShared ? null : ctx.userId;
  return {
    kind: "disbursement" as const,
    main: {
      amount: line.amount,
      description,
      date,
      madeById,
      expenseCategory: choice.category.trim(),
      destinationKind: "category" as const,
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
            destinationKind: "category" as const,
            accountId: ctx.accountId,
          }
        : null,
  };
}
