/**
 * The money-in side of the expense ledger.
 *
 * A list of expenses on its own cannot be checked: spending of 60,000 is too
 * much or fine depending on what came in, and the Reports screen had no list
 * of what came in. This builds one, a row per deposit that counts as income.
 *
 * "Counts as income" is the rule the income-stream report already uses: a
 * transfer between your own accounts moved money without adding any, money
 * borrowed has to be paid back, a repayment to you is money you already had
 * once, and a withdrawal from savings was income in the month it was saved.
 * None of those are rows here. They are totalled separately, because the one
 * thing this screen is for is matching against a statement, and a statement
 * shows them.
 */

export type DepositKind = "income" | "borrowed" | "repaid" | "from_savings";

export type IncomeDepositRow = {
  id: number;
  date: string;
  description: string;
  amount: number;
  incomeSourceId: number | null;
  makerName: string | null;
  accountName: string | null;
  kind: DepositKind;
};

/** One contributor portion of a deposit, in the order it was entered. */
export type IncomeSplitRow = {
  transactionId: number;
  incomeSourceId: number | null;
  personName: string | null;
};

export const NO_INCOME_STREAM = "No income stream";
export const NOT_RECORDED = "Not recorded";

function distinctInOrder(values: string[]): string[] {
  return [...new Set(values)];
}

export function buildIncomeLedger(input: {
  from: string;
  to: string;
  deposits: IncomeDepositRow[];
  splits: IncomeSplitRow[];
  /** Every income stream the group owns, by id. A stream id that is not here
   *  was deleted or belongs to somebody else, and reads as no stream. */
  streamNames: Map<number, string>;
}) {
  const splitsByDeposit = new Map<number, IncomeSplitRow[]>();
  for (const split of input.splits) {
    const list = splitsByDeposit.get(split.transactionId) ?? [];
    list.push(split);
    splitsByDeposit.set(split.transactionId, list);
  }

  const streamName = (id: number | null) =>
    (id != null ? input.streamNames.get(id) : undefined) ?? NO_INCOME_STREAM;

  const otherMoneyIn = { borrowed: 0, repaidToYou: 0, fromSavings: 0 };
  const entries = [];

  for (const deposit of input.deposits) {
    const amount = Number(deposit.amount);
    if (deposit.kind === "borrowed") { otherMoneyIn.borrowed += amount; continue; }
    if (deposit.kind === "repaid") { otherMoneyIn.repaidToYou += amount; continue; }
    if (deposit.kind === "from_savings") { otherMoneyIn.fromSavings += amount; continue; }

    // A split deposit names its streams and people on its portions; the
    // deposit's own columns only speak for an unsplit one.
    const portions = splitsByDeposit.get(deposit.id) ?? [];
    const streams = portions.length > 0
      ? distinctInOrder(portions.map((portion) => streamName(portion.incomeSourceId)))
      : [streamName(deposit.incomeSourceId)];
    const people = portions.length > 0
      ? distinctInOrder(portions.map((portion) => portion.personName?.trim() || NOT_RECORDED))
      : [deposit.makerName?.trim() || NOT_RECORDED];

    entries.push({
      id: `deposit-${deposit.id}`,
      transactionId: deposit.id,
      date: String(deposit.date),
      description: deposit.description,
      amount,
      streams,
      receivedFrom: people.join(" + "),
      accountName: deposit.accountName ?? null,
    });
  }

  entries.sort((a, b) => (a.date === b.date ? b.transactionId - a.transactionId : b.date.localeCompare(a.date)));

  return {
    from: input.from,
    to: input.to,
    total: entries.reduce((sum, entry) => sum + entry.amount, 0),
    entries,
    otherMoneyIn,
  };
}
