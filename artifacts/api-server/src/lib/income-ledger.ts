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
  amount: number;
};

export const NO_INCOME_STREAM = "No income stream";
export const NOT_RECORDED = "Not recorded";

function distinctInOrder<T>(values: T[]): T[] {
  return [...new Set(values)];
}

const cents = (value: number) => Math.round(value * 100) / 100;

export function buildIncomeLedger(input: {
  from: string;
  to: string;
  deposits: IncomeDepositRow[];
  splits: IncomeSplitRow[];
  /** Every income stream the group owns, by id. A stream id that is not here
   *  was deleted or belongs to somebody else, and reads as no stream. */
  streamNames: Map<number, string>;
  /** What each stream cost to run over the period: spending in the categories
   *  linked to it. A side hustle's income is its profit, not its sales. */
  costsByStream: Map<number, number>;
}) {
  const splitsByDeposit = new Map<number, IncomeSplitRow[]>();
  for (const split of input.splits) {
    const list = splitsByDeposit.get(split.transactionId) ?? [];
    list.push(split);
    splitsByDeposit.set(split.transactionId, list);
  }

  // A stream id the group does not own reads as no stream, the same as none.
  const ownStream = (id: number | null) => (id != null && input.streamNames.has(Number(id)) ? Number(id) : null);
  const streamName = (id: number | null) => (id != null ? input.streamNames.get(id) : undefined) ?? NO_INCOME_STREAM;

  const otherMoneyIn = { borrowed: 0, repaidToYou: 0, fromSavings: 0 };
  const receivedByStream = new Map<number | null, number>();
  const entries = [];

  for (const deposit of input.deposits) {
    const amount = Number(deposit.amount);
    if (deposit.kind === "borrowed") { otherMoneyIn.borrowed += amount; continue; }
    if (deposit.kind === "repaid") { otherMoneyIn.repaidToYou += amount; continue; }
    if (deposit.kind === "from_savings") { otherMoneyIn.fromSavings += amount; continue; }

    // A split deposit names its streams and people on its portions; the
    // deposit's own columns only speak for an unsplit one. Each stream is
    // credited with its own share, never the whole deposit.
    const splits = splitsByDeposit.get(deposit.id) ?? [];
    const portions = splits.length > 0
      ? splits.map((split) => ({ incomeSourceId: ownStream(split.incomeSourceId), amount: Number(split.amount) }))
      : [{ incomeSourceId: ownStream(deposit.incomeSourceId), amount }];
    for (const portion of portions) {
      receivedByStream.set(portion.incomeSourceId, (receivedByStream.get(portion.incomeSourceId) ?? 0) + portion.amount);
    }
    const people = splits.length > 0
      ? distinctInOrder(splits.map((split) => split.personName?.trim() || NOT_RECORDED))
      : [deposit.makerName?.trim() || NOT_RECORDED];

    entries.push({
      id: `deposit-${deposit.id}`,
      transactionId: deposit.id,
      date: String(deposit.date),
      description: deposit.description,
      amount,
      streams: distinctInOrder(portions.map((portion) => streamName(portion.incomeSourceId))),
      receivedFrom: people.join(" + "),
      accountName: deposit.accountName ?? null,
      portions,
    });
  }

  entries.sort((a, b) => (a.date === b.date ? b.transactionId - a.transactionId : b.date.localeCompare(a.date)));

  // Every stream that brought money in, and every one that cost something to
  // run even in a period when it sold nothing - that is a loss, and hiding it
  // would overstate what was earned.
  const streamIds = distinctInOrder<number | null>([
    ...receivedByStream.keys(),
    ...[...input.costsByStream.keys()].filter((id) => input.streamNames.has(id)),
  ]);
  const streams = streamIds.map((id) => {
    const received = cents(receivedByStream.get(id) ?? 0);
    const costs = cents(id == null ? 0 : input.costsByStream.get(id) ?? 0);
    return { incomeSourceId: id, name: streamName(id), received, costs, net: cents(received - costs) };
  }).sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));

  const received = cents(entries.reduce((sum, entry) => sum + entry.amount, 0));
  const costs = cents(streams.reduce((sum, stream) => sum + stream.costs, 0));

  return {
    from: input.from,
    to: input.to,
    total: cents(received - costs),
    received,
    costs,
    streams,
    entries,
    otherMoneyIn,
  };
}
